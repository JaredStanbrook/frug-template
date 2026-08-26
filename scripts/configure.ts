/**
 * One-shot repo configuration.
 *
 * Rewrites every placeholder in wrangler.jsonc from a handful of answers, so
 * setting up a new site is one command instead of a hunt through the file.
 * Intended to be run for you by Claude — you supply the values in chat, and
 * the ids come from the Cloudflare dashboard.
 *
 *   npm run configure -- \
 *     --name my-site \
 *     --app-name "My Site" \
 *     --tagline "Does a thing" \
 *     --domain my-site.example.com \
 *     --d1-name my-site-db \
 *     --d1-id  <uuid from the dashboard> \
 *     --kv-id  <32-hex from the dashboard> \
 *     --admin-email you@example.com
 *
 * Optional:
 *   --r2-bucket <name>   keep R2 and point it at this bucket
 *   --no-r2              remove the R2 binding entirely
 *   --locale en-GB  --currency GBP
 *
 * Rewrites are plain string substitutions against the known placeholders, so
 * the file keeps its comments and formatting. Re-running is safe: values that
 * are already set simply do not match any placeholder.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CONFIG = "wrangler.jsonc";

type Args = Record<string, string | boolean>;

const parseArgs = (): Args => {
  const out: Args = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
};

const usage = () => {
  console.log(
    [
      'Usage: npm run configure -- --name my-site --app-name "My Site" \\',
      "         --domain my-site.example.com --d1-name my-site-db \\",
      "         --d1-id <uuid> --kv-id <32-hex> --admin-email you@example.com",
      "",
      "Required: --name --app-name --d1-name --d1-id --kv-id",
      "Optional: --domain --tagline --admin-email --locale --currency",
      "          --r2-bucket <name> | --no-r2      (R2 is for uploaded files)",
      "          --no-kv                          (only if passkeys are off)",
      "",
      "Omit --domain to deploy on <name>.<subdomain>.workers.dev.",
    ].join("\n"),
  );
};

const str = (v: string | boolean | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Remove a whole top-level block (`"routes": [ … ],`) plus any comment lines
 * immediately above it.
 *
 * Done by bracket matching rather than a regex: the file is JSONC with
 * comments, nested arrays and objects, and formatting that Prettier rewrites.
 * A regex that assumed one indentation style silently stopped matching the
 * first time the file was reformatted.
 *
 * Returns null when the key is absent, so callers can tell "removed" from
 * "was not there".
 */
const removeTopLevelBlock = (source: string, key: string): string | null => {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.trim().startsWith(`"${key}":`));
  if (start === -1) return null;

  // Walk forward, tracking bracket depth, until the block closes.
  let depth = 0;
  let end = -1;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "[" || ch === "{") depth++;
      else if (ch === "]" || ch === "}") depth--;
    }
    if (depth <= 0) {
      end = i;
      break;
    }
  }
  if (end === -1) return null;

  // Absorb the comment block directly above it, and one blank separator line.
  let from = start;
  while (from > 0 && lines[from - 1].trim().startsWith("//")) from--;
  if (from > 0 && lines[from - 1].trim() === "") from--;

  lines.splice(from, end - from + 1);
  return lines.join("\n");
};

const run = () => {
  const args = parseArgs();

  if (args.help || args.h) {
    usage();
    return;
  }

  if (!existsSync(CONFIG)) {
    console.error(`${CONFIG} not found — run this from the repository root.`);
    process.exit(1);
  }

  const name = str(args.name);
  const appName = str(args["app-name"]) ?? name;
  const d1Name = str(args["d1-name"]);
  const d1Id = str(args["d1-id"]);
  const kvId = str(args["kv-id"]);

  const dropKv = Boolean(args["no-kv"]);

  const required: Record<string, string | undefined> = {
    "--name": name,
    "--app-name": appName,
    "--d1-name": d1Name,
    "--d1-id": d1Id,
  };
  // KV is only dispensable when the site has no passkey sign-in; see
  // references/bindings.md. Requiring an explicit --no-kv makes that a choice
  // rather than an omission.
  if (!dropKv) required["--kv-id (or --no-kv)"] = kvId;

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    console.error(`Missing required flag(s): ${missing.join(", ")}\n`);
    usage();
    process.exit(1);
  }

  // Fail early on the mistakes that are silent at deploy time.
  const domain = str(args.domain);
  if (domain && (domain.includes("://") || domain.includes("/"))) {
    console.error(`--domain must be a bare hostname, not a URL. Got: ${domain}`);
    process.exit(1);
  }
  if (!/^[0-9a-f-]{32,36}$/i.test(d1Id!)) {
    console.error(`--d1-id does not look like a Cloudflare database id: ${d1Id}`);
    process.exit(1);
  }
  if (!dropKv && !/^[0-9a-f]{32}$/i.test(kvId!)) {
    console.error(`--kv-id does not look like a Cloudflare namespace id: ${kvId}`);
    process.exit(1);
  }

  const warnings: string[] = [];

  let s = readFileSync(CONFIG, "utf-8");
  const before = s;

  s = s.replaceAll('"name": "frug-app"', `"name": ${JSON.stringify(name)}`);
  s = s.replaceAll('"database_name": "change-me-db"', `"database_name": ${JSON.stringify(d1Name)}`);
  s = s.replaceAll(
    '"database_id": "00000000-0000-0000-0000-000000000000"',
    `"database_id": ${JSON.stringify(d1Id)}`,
  );
  if (dropKv) {
    const stripped = removeTopLevelBlock(s, "kv_namespaces");
    if (stripped === null) {
      console.error("Could not find the kv_namespaces block to remove — remove it by hand.");
      process.exit(1);
    }
    s = stripped;
    warnings.push(
      "Removed the KV binding. Also delete `KV` from the Bindings type in\n" +
        "  worker/types.ts, and make sure AUTH_METHODS does not include `passkey` —\n" +
        "  passkey sign-in stores its challenge in KV and will fail without it.",
    );
  } else {
    s = s.replaceAll('"id": "00000000000000000000000000000000"', `"id": ${JSON.stringify(kvId)}`);
  }

  s = s.replaceAll('"APP_NAME": "Frug"', `"APP_NAME": ${JSON.stringify(appName)}`);
  s = s.replaceAll('"RP_NAME": "Frug"', `"RP_NAME": ${JSON.stringify(appName)}`);
  s = s.replaceAll('"TOTP_ISSUER": "Frug"', `"TOTP_ISSUER": ${JSON.stringify(appName)}`);

  const tagline = str(args.tagline);
  if (tagline) {
    s = s.replace(/"APP_TAGLINE": "[^"]*"/, `"APP_TAGLINE": ${JSON.stringify(tagline)}`);
  }

  const locale = str(args.locale);
  if (locale) s = s.replace(/"APP_LOCALE": "[^"]*"/, `"APP_LOCALE": ${JSON.stringify(locale)}`);
  const currency = str(args.currency);
  if (currency)
    s = s.replace(/"APP_CURRENCY": "[^"]*"/, `"APP_CURRENCY": ${JSON.stringify(currency)}`);

  const adminEmail = str(args["admin-email"]);
  if (adminEmail) {
    s = s.replace(
      /"BOOTSTRAP_ADMIN_EMAIL": "[^"]*"/,
      `"BOOTSTRAP_ADMIN_EMAIL": ${JSON.stringify(adminEmail)}`,
    );
  }

  // Routes: a custom domain, or drop the block so the worker publishes on
  // workers.dev. RP_ID/ORIGIN must follow the same decision or passkeys break.
  if (domain) {
    s = s.replaceAll('"pattern": "change-me.example.com"', `"pattern": ${JSON.stringify(domain)}`);
    s = s.replaceAll('"RP_ID": "change-me.example.com"', `"RP_ID": ${JSON.stringify(domain)}`);
    s = s.replaceAll(
      '"ORIGIN": "https://change-me.example.com"',
      `"ORIGIN": ${JSON.stringify(`https://${domain}`)}`,
    );
  } else {
    const stripped = removeTopLevelBlock(s, "routes");
    if (stripped === null) {
      console.error("Could not find the routes block to remove — remove it by hand.");
      process.exit(1);
    }
    s = stripped;
    warnings.push(
      [
        "No --domain given: the routes block was removed and the worker will",
        "publish on <name>.<subdomain>.workers.dev.",
        "",
        "IMPORTANT: passkeys need RP_ID and ORIGIN to match the real hostname.",
        "After the first deploy, set them to your workers.dev hostname (or",
        "re-run with --domain once you attach a custom domain).",
      ].join("\n"),
    );
  }

  const r2Bucket = str(args["r2-bucket"]);
  if (args["no-r2"]) {
    const strippedR2 = removeTopLevelBlock(s, "r2_buckets");
    if (strippedR2 === null) {
      console.error("Could not find the r2_buckets block to remove — remove it by hand.");
      process.exit(1);
    }
    s = strippedR2;
    warnings.push(
      "Removed the R2 binding. Also delete `R2` from the Bindings type in\n" + "  worker/types.ts.",
    );
  } else if (r2Bucket) {
    s = s.replaceAll(
      '"bucket_name": "change-me-files"',
      `"bucket_name": ${JSON.stringify(r2Bucket)}`,
    );
  }

  if (s === before) {
    console.log("Nothing changed — the placeholders appear to be filled in already.");
    return;
  }

  writeFileSync(CONFIG, s);

  const remaining = s
    .split("\n")
    .map((line, i) => [i + 1, line] as const)
    .filter(([, line]) => /change-me|0000000/i.test(line) && !line.trim().startsWith("//"));

  console.log(`Updated ${CONFIG}.`);
  if (remaining.length) {
    console.log("\nStill unset:");
    for (const [n, line] of remaining) console.log(`  ${n}: ${line.trim()}`);
  } else {
    console.log("No placeholders remain.");
  }

  if (warnings.length) {
    console.log("\nBefore you build:");
    for (const w of warnings) console.log(`- ${w}`);
  }

  console.log(
    [
      "",
      "Next:",
      "  1. Commit and push.",
      "  2. In the Cloudflare dashboard, set JWT_SECRET as a Secret on the Worker.",
      "  3. Connect the repo under Workers & Pages → your Worker → Settings → Builds.",
      "",
      "See docs/deploy.md.",
    ].join("\n"),
  );
};

run();
