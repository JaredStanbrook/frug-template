/**
 * Track and apply updates from the Frugal template.
 *
 * `frugal.json` records which template release this repo is built from. The
 * template tags each release `v<version>`; this script fetches those tags
 * under `refs/tags/frugal/*`, so they never clash with the site's own tags,
 * and replays the template's changes between two releases onto this repo.
 *
 *   npm run template                    what has changed since this repo's version
 *   npm run template -- upgrade         apply every release up to the latest
 *   npm run template -- upgrade 0.3.0   apply releases up to 0.3.0 only
 *   npm run template -- pin 0.2.0       record a version worked out by hand
 *   npm run template -- guess           help work out the version of an
 *                                       unversioned site (see below)
 *
 * A site with no `frugal.json` predates versioning. Which release it matches
 * has to be worked out by hand, because it may carry any mix of template
 * changes copied over manually. `guess` lists how far the repo is from each
 * release as a starting point; compare against the CHANGELOG, then `pin` the
 * release whose changes it fully has.
 *
 * What an upgrade does not touch:
 *   - drizzle/: migration numbers are per repo, so a template migration would
 *     collide with the site's own. The schema files in worker/schema/ are
 *     patched instead, and `npm run gen` writes this repo's migration for them.
 *   - CHANGELOG.md and frugal.json: the site's own. The template's changelog
 *     is printed instead, and frugal.json is set to the new version.
 *   - files this repo has deleted (the notes example, say): listed, skipped.
 * Everything else is a three-way merge. Conflicts are left as markers in the
 * files, exactly as `git merge` leaves them.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FILE = "frugal.json";
const DEFAULT_TEMPLATE = "https://github.com/JaredStanbrook/frug-template";
const TAG_PREFIX = "frugal/v";
const NOT_PATCHED = ["drizzle", "CHANGELOG.md", FILE];

type TemplateRecord = { "//"?: string; template: string; version: string };

/** Raw output: a patch's last line can be a lone space, which trimming would break. */
const gitRaw = (args: string[], input?: string) =>
  execFileSync("git", args, { encoding: "utf8", input, maxBuffer: 1 << 28 });
const git = (args: string[], input?: string) => gitRaw(args, input).trim();

const tryGit = (args: string[]) => {
  try {
    return git(args);
  } catch {
    return null;
  }
};

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const readRecord = (): TemplateRecord | null =>
  existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as TemplateRecord) : null;

const writeRecord = (record: TemplateRecord) =>
  writeFileSync(FILE, JSON.stringify(record, null, 2) + "\n");

const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
const compare = (a: string, b: string) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};
const isVersion = (v: string) => /^\d+\.\d+\.\d+$/.test(v);

/** Fetch the template's release tags and return their versions, oldest first. */
const fetchReleases = (template: string) => {
  const url =
    /^https?:/.test(template) && !template.endsWith(".git") ? `${template}.git` : template;
  if (
    tryGit(["fetch", "--quiet", "--no-tags", url, `+refs/tags/v*:refs/tags/${TAG_PREFIX}*`]) ===
    null
  ) {
    die(`Could not fetch the template's releases from ${url}.`);
  }
  return git(["tag", "--list", `${TAG_PREFIX}*`])
    .split("\n")
    .map((tag) => tag.slice(TAG_PREFIX.length))
    .filter(isVersion)
    .sort(compare);
};

const tag = (version: string) => `${TAG_PREFIX}${version}`;

/** The template CHANGELOG sections after `from`, up to and including `to`. */
const changelogBetween = (from: string, to: string) => {
  const text = tryGit(["show", `${tag(to)}:CHANGELOG.md`]) ?? "";
  return text
    .split(/^(?=## \[)/m)
    .filter((section) => {
      const v = section.match(/^## \[(\d+\.\d+\.\d+)\]/)?.[1];
      return v && compare(v, from) > 0 && compare(v, to) <= 0;
    })
    .join("")
    .trim();
};

const noRecord = () =>
  die(
    [
      `No ${FILE}: this repo predates template versioning, so which release it`,
      "is built from has to be worked out by hand before it can be upgraded.",
      "",
      "  1. npm run template -- guess        how far the repo is from each release",
      "  2. Compare with the template's CHANGELOG.md to find the newest release",
      "     whose changes this repo already has in full.",
      "  3. npm run template -- pin <version>",
      "",
      "Until then, treat every template change as a manual port.",
    ].join("\n"),
  );

const status = (record: TemplateRecord) => {
  const releases = fetchReleases(record.template);
  const latest = releases.at(-1);
  console.log(`This repo: template ${record.version}. Latest release: ${latest ?? "none"}.`);
  if (!latest || compare(latest, record.version) <= 0) return console.log("Up to date.");
  const pending = releases.filter((v) => compare(v, record.version) > 0);
  console.log(`Not yet applied: ${pending.join(", ")}. Run: npm run template -- upgrade\n`);
  console.log(changelogBetween(record.version, latest));
};

const upgrade = (record: TemplateRecord, target?: string) => {
  if (git(["status", "--porcelain"])) die("Commit or stash your changes first.");

  const releases = fetchReleases(record.template);
  const to = target ?? releases.at(-1);
  if (!to || !releases.includes(to)) die(`No template release ${to ?? ""}. Have: ${releases}`);
  if (!releases.includes(record.version)) {
    die(`This repo's version ${record.version} is not a template release. Pin a real one.`);
  }
  if (compare(to!, record.version) <= 0) return console.log(`Already on ${record.version}.`);

  const range = [tag(record.version), tag(to!)];

  // A file the template changed but this repo deleted cannot be patched, and
  // one such file makes `git apply` refuse the whole patch. Skip and list them.
  const changed = git(["diff", "--no-renames", "--name-status", ...range])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [kind, path] = line.split("\t");
      return { kind, path };
    })
    .filter(({ path }) => !NOT_PATCHED.some((p) => path === p || path.startsWith(`${p}/`)));
  const deletedHere = changed.filter(
    ({ kind, path }) => kind !== "A" && tryGit(["cat-file", "-e", `HEAD:${path}`]) === null,
  );
  const skip = [...NOT_PATCHED, ...deletedHere.map((f) => f.path)];

  const patch = gitRaw([
    "diff",
    "--binary",
    "--no-renames",
    ...range,
    "--",
    ".",
    ...skip.map((p) => `:(exclude)${p}`),
  ]);

  let clean = true;
  if (patch) {
    try {
      gitRaw(["apply", "--3way", "--whitespace=nowarn"], patch);
    } catch {
      clean = false;
    }
  }

  writeRecord({ ...record, version: to! });
  git(["add", FILE]);

  console.log(`Applied template ${record.version} -> ${to}.\n`);
  console.log(changelogBetween(record.version, to!));
  console.log("");
  if (deletedHere.length) {
    console.log("Skipped, because this repo deleted them (port by hand if still wanted):");
    for (const f of deletedHere) console.log(`  ${f.path}`);
  }
  if (changed.some(({ path }) => path.startsWith("worker/schema/"))) {
    console.log("The schema changed: run `npm run gen` to write this repo's migration.");
  }
  if (!clean) {
    console.log("Conflicts left as markers. Resolve them: git diff --name-only --diff-filter=U");
  }
  console.log("Then: npm run build && npm test, and commit.");
  if (!clean) process.exit(2);
};

/** For an unversioned repo: changed-line counts against each release. */
const guess = (template: string) => {
  const releases = fetchReleases(template);
  if (!releases.length) die("The template has no releases yet.");
  console.log("Lines differing from each release (worker/ scripts/ only, smaller = closer):");
  for (const v of releases) {
    const stat = git(["diff", "--shortstat", tag(v), "HEAD", "--", "worker", "scripts"]);
    console.log(`  ${v.padEnd(10)} ${stat || "identical"}`);
  }
  console.log("\nA site's own features add lines to every row. Read the CHANGELOG, then pin.");
};

const [command = "status", arg] = process.argv.slice(2);
const record = readRecord();

if (command === "pin") {
  if (!arg || !isVersion(arg)) die("Usage: npm run template -- pin <version>, e.g. 0.2.0");
  const releases = fetchReleases(record?.template ?? DEFAULT_TEMPLATE);
  if (!releases.includes(arg!)) die(`No template release ${arg}. Have: ${releases.join(", ")}`);
  writeRecord({
    "//": "The Frugal template version this repo is built from. Change it only through `npm run template -- upgrade`.",
    template: record?.template ?? DEFAULT_TEMPLATE,
    version: arg!,
  });
  console.log(`Recorded template ${arg} in ${FILE}. Commit it.`);
} else if (command === "guess") {
  guess(record?.template ?? DEFAULT_TEMPLATE);
} else if (!record) {
  noRecord();
} else if (command === "status") {
  status(record);
} else if (command === "upgrade") {
  upgrade(record, arg);
} else {
  die(`Unknown command ${command}. Use status, upgrade [version], pin <version> or guess.`);
}
