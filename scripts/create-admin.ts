import { spawnSync } from "node:child_process";

import { hashPassword, randomBase64Url } from "../worker/lib/crypto";

type Mode = "local" | "remote";

const usage = () => {
  console.log(
    [
      "Usage:",
      "  npm run create-admin:local -- --email you@domain.com --password 'Secret123!'",
      "  npm run create-admin:remote -- --email you@domain.com --password 'Secret123!'",
      "",
      "Options:",
      "  --email           Email address for the admin user (required)",
      "  --password        Password for the admin user (required unless --generate)",
      "  --generate        Generate a strong password and print it",
      "  --display-name    Optional display name",
      "  --username        Optional username",
      "  --local           Run against local D1",
      "  --remote          Run against remote D1",
      "  --reset-password  Update password if user already exists",
      "",
    ].join("\n"),
  );
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };
  const has = (flag: string) => args.includes(flag);

  const email = get("--email");
  const password = get("--password");
  const displayName = get("--display-name");
  const username = get("--username");
  const generate = has("--generate");
  const resetPassword = has("--reset-password");
  const mode: Mode = has("--remote") ? "remote" : "local";
  const explicitMode = has("--remote") || has("--local");

  return {
    email,
    password,
    displayName,
    username,
    generate,
    resetPassword,
    mode,
    explicitMode,
  };
};

/**
 * Wrangler resolves a D1 binding name against wrangler.jsonc, so targeting
 * "DB" works for any site without this script needing to know the database's
 * real name. Override with D1_DATABASE_NAME if you have several databases.
 */
const databaseTarget = () => process.env.D1_DATABASE_NAME || "DB";

const escapeSql = (value: string) => value.replace(/'/g, "''");

const run = async () => {
  const { email, password, displayName, username, generate, resetPassword, mode, explicitMode } =
    parseArgs();

  if (!email) {
    console.error("Missing --email");
    usage();
    process.exit(1);
  }

  if (!explicitMode) {
    console.error("Missing --local or --remote");
    usage();
    process.exit(1);
  }

  let finalPassword = password;
  if (!finalPassword && generate) {
    finalPassword = randomBase64Url(18);
    console.log(`Generated password: ${finalPassword}`);
  }

  if (!finalPassword) {
    console.error("Missing --password (or use --generate)");
    usage();
    process.exit(1);
  }

  const passwordHash = await hashPassword(finalPassword);
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const roleId = crypto.randomUUID();

  const emailSql = escapeSql(email);
  const displayNameSql = displayName ? `'${escapeSql(displayName)}'` : "NULL";
  const usernameSql = username ? `'${escapeSql(username)}'` : "NULL";
  const hashSql = escapeSql(passwordHash);
  const nowSql = escapeSql(now);

  const insertUser = `
    INSERT OR IGNORE INTO users (
      id, email, display_name, username, password_hash,
      is_active, email_verified, created_at, updated_at
    ) VALUES (
      '${userId}', '${emailSql}', ${displayNameSql}, ${usernameSql},
      '${hashSql}', 1, 1, '${nowSql}', '${nowSql}'
    );
  `;

  const updatePassword = resetPassword
    ? `
    UPDATE users
    SET password_hash = '${hashSql}', updated_at = '${nowSql}'
    WHERE email = '${emailSql}';
  `
    : "";

  const ensureAdminRole = `
    INSERT INTO user_roles (id, user_id, role, assigned_at)
    SELECT '${roleId}', u.id, 'admin', unixepoch() * 1000
    FROM users u
    WHERE u.email = '${emailSql}'
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = u.id AND ur.role = 'admin'
      );
  `;

  const sql = `${insertUser}${updatePassword}${ensureAdminRole}`;
  const dbName = databaseTarget();
  const modeFlag = mode === "remote" ? "--remote" : "--local";

  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", dbName, modeFlag, "--command", sql, "--yes"],
    { encoding: "utf-8" },
  );

  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.stderr?.trim()) console.error(result.stderr.trim());

  if (result.status !== 0) {
    console.error(`create-admin failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }

  console.log(`Admin user ensured for ${email}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
