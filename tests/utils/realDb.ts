import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";

/**
 * A real SQLite database, built from the real migrations, for tests that
 * depend on what the database actually does.
 *
 * `createFakeDb` is a shape stub: it ignores `where` clauses entirely, so
 * every query against it returns the same rows. That is fine for "does this
 * page render", and worthless for anything about authentication, where the
 * whole question is whether a `where` matched the right row — a login test
 * against the fake db passes just as happily when the lookup is wrong.
 *
 * This runs `drizzle/*.sql` against an in-memory database through
 * `node:sqlite`, so the schema under test is the schema that ships. No new
 * dependency: drizzle's sqlite-proxy driver takes any callback that can run
 * SQL, and Node has had SQLite built in since 22.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "drizzle");

/** Drizzle sends one statement at a time; `columns()` gives us value order. */
const run = (sqlite: DatabaseSync, sql: string, params: any[], method: string) => {
  const stmt = sqlite.prepare(sql);

  if (method === "run") {
    stmt.run(...params);
    return { rows: [] };
  }

  const order = stmt.columns().map((c) => c.name);
  const toValues = (row: Record<string, unknown>) => order.map((name) => row[name] ?? null);
  const rows = stmt.all(...params) as Record<string, unknown>[];

  // `get` wants the single row's values; everything else wants rows of values.
  // A miss has to be undefined, not []: drizzle maps a falsy result to
  // `undefined`, and an empty array is truthy, so it would hand back an object
  // with every field undefined — a "row" that is not there.
  if (method === "get") {
    return { rows: rows[0] ? toValues(rows[0]) : (undefined as any) };
  }
  return { rows: rows.map(toValues) };
};

export const createRealDb = () => {
  const sqlite = new DatabaseSync(":memory:");

  // Forward-only, applied in filename order, exactly as `npm run deploy` does.
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const body = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    // Drizzle separates statements with its own marker.
    for (const statement of body.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }

  const db = drizzle(async (sql, params, method) => run(sqlite, sql, params, method));

  return { db: db as any, sqlite, close: () => sqlite.close() };
};
