# Bindings: D1, KV, R2

A binding is a resource attached to the Worker in `wrangler.jsonc` and reached
at runtime as `c.env.NAME`. Three rules cover most of the trouble:

1. **A declared binding must exist**, or the deploy fails. An unused block gets
   deleted, not left on a placeholder.
2. **The binding name is yours**, chosen in `wrangler.jsonc`, not by
   Cloudflare. The dashboard may suggest one; the code decides. `c.env.KV` works
   because the block says `"binding": "KV"`.
3. **Ids come from the dashboard.** They cannot be guessed or derived.

Every change here is two edits: the block in `wrangler.jsonc`, and the type in
`worker/types.ts`. Skipping the second leaves `c.env.X` untyped or wrongly
typed.

## Contents

- [What each is for](#what-each-is-for)
- [Which to use](#which-to-use)
- [D1](#d1)
- [KV](#kv)
- [R2](#r2)
- [Removing a binding](#removing-a-binding)
- [Adding a binding later](#adding-a-binding-later)
- [Verifying](#verifying)

## What each is for

| | Shape | Good at | Wrong for |
| --- | --- | --- | --- |
| **D1** | SQLite, relational | Anything queried, filtered, joined or counted | Large blobs |
| **KV** | Key/value, eventually consistent | Short-lived tokens, cached fragments, feature flags | Anything read straight after write, or queried by anything but its key |
| **R2** | Object storage | Files: images, PDFs, exports, uploads | Structured data, anything you filter on |

KV's eventual consistency is the trap. A write is not guaranteed visible to a
read moments later, so it cannot hold anything the next request depends on.
The template uses it for WebAuthn challenges, which have a 5-minute TTL and are
read once.

## Which to use

Work from the data, not the feature:

- Does something list, filter, sort or count it? → **D1**
- Is it a file a user uploads or downloads? → **R2**, with a D1 row holding its
  key plus whatever you query on (owner, name, size, type)
- Is it disposable, keyed, and read at most once soon after writing? → **KV**

A file feature is almost always R2 *and* D1: the object in R2, the metadata in
D1. Storing an R2 key without a D1 row means nothing can list a user's files.

## D1

Required. Auth, roles and every feature table live here. Removing it is not
supported by this template.

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "my-site-db",
    "database_id": "<uuid from the dashboard>",
    "migrations_dir": "drizzle",
  },
],
```

Reached as `c.var.db` (a Drizzle client built in `db.middleware.ts`) rather
than `c.env.DB` directly. Keep `migrations_dir` — it is what
`wrangler d1 migrations apply DB` reads.

Dashboard: **Storage & Databases → D1 → Create**. The Database ID is on the
database's overview page.

## KV

Needed when `AUTH_METHODS` includes `passkey`: `auth.service.ts` stores the
WebAuthn challenge in KV between the options call and the verify call, keyed by
a random id with a 5-minute TTL.

```jsonc
"kv_namespaces": [{ "binding": "KV", "id": "<32 hex from the dashboard>" }],
```

Using it directly:

```ts
await c.env.KV.put(`draft:${id}`, JSON.stringify(value), { expirationTtl: 600 });
const raw = await c.env.KV.get(`draft:${id}`);
```

Always set `expirationTtl` on anything transient — KV has no sweeper, and
entries without one live forever.

Dashboard: **Storage & Databases → KV → Create Instance**.

## R2

Optional, for files.

```jsonc
"r2_buckets": [{ "binding": "R2", "bucket_name": "my-site-files" }],
```

The shape that works: object in R2, row in D1.

```ts
// Schema — what you can query on.
export const attachment = sqliteTable("attachment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull(),          // the R2 object key
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  ...ownershipColumns,
});

// Upload — namespace the key by owner so one user's keys cannot collide
// with another's, and so a prefix list is scoped for free.
const key = `${user.id}/${crypto.randomUUID()}/${file.name}`;
await c.env.R2.put(key, file.stream(), {
  httpMetadata: { contentType: file.type },
});
await c.var.db.insert(attachment).values({ key, filename: file.name, ... });

// Download — stream through the Worker so the guard applies. R2 objects are
// not public, and a direct bucket URL would bypass the ownership check.
const row = await c.var.db.select().from(attachment)
  .where(and(eq(attachment.id, id), eq(attachment.userId, user.id))).get();
if (!row) return c.notFound();

const object = await c.env.R2.get(row.key);
if (!object) return c.notFound();       // row without object: possible, handle it
return new Response(object.body, {
  headers: { "Content-Type": row.contentType },
});
```

Deleting: remove the R2 object *and* the row. With the soft-delete convention,
that usually means setting `deletedAt` now and reaping objects later, since an
R2 delete cannot be undone.

Enforce a size limit before reading the stream — a Worker has finite memory and
an unbounded upload is a denial-of-service shape.

Dashboard: **R2 → Create bucket**.

## Removing a binding

Both halves, or the build lies to you:

1. Delete the block from `wrangler.jsonc`.
2. Delete the property from `Bindings` in `worker/types.ts`.
3. `npm run gen` to regenerate `worker-configuration.d.ts`.
4. Remove any code that used it.

`npm run configure -- --no-r2` (or `--no-kv`) does the first step and tells you
about the second.

Leaving the type but deleting the block is the dangerous direction: `c.env.R2`
still typechecks and is `undefined` at runtime.

## Adding a binding later

Same two halves in reverse — add the block, add the type, `npm run gen`, then
push. The next deploy picks it up; no dashboard change beyond creating the
resource.

Adding R2 to a site that did not have it also means adding a table for the
metadata, which means a migration.

## Verifying

```bash
npx wrangler deploy --dry-run
```

It prints every binding and the resource it resolved to. Read that list against
what the user gave you — it is the only place a wrong-but-well-formed id shows
up before production.

```
env.KV (70192fe3…)              KV Namespace
env.DB (my-site-db)             D1 Database
env.R2 (my-site-files)          R2 Bucket
env.RATE_LIMITER (20 req/60s)   Rate Limit
env.ASSETS                      Assets
```

A missing line means the block is absent. A line resolving to the wrong name
means an id from another project — the failure mode that puts a new site's
data in an existing site's database.
