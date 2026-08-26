# Backend: data, routes, auth

Everything under `worker/` that is not a view or a client component.

## Contents

- [Schema and validation](#schema-and-validation)
- [Migrations](#migrations)
- [Routes](#routes)
- [Responding to HTMX](#responding-to-htmx)
- [Services](#services)
- [Authentication](#authentication)
- [Authorisation](#authorisation)
- [Configuration](#configuration)
- [Testing](#testing)

## Schema and validation

One file per feature in `worker/schema/`. The table is the source of truth;
validators are derived from it, so a column change propagates without a second
edit.

```ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { ownershipColumns } from "./common";

export const thing = sqliteTable(
  "thing",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    deletedAt: text("deleted_at"),
    ...ownershipColumns, // userId + createdAt + updatedAt
  },
  (table) => [index("thing_user_idx").on(table.userId)],
);

export const insertThingSchema = createInsertSchema(thing, {
  title: z.string().min(1).max(120),
});
export type SelectThing = z.infer<typeof selectThingSchema>;
```

**Form schemas differ from insert schemas.** A checkbox arrives as `"on"` or is
absent entirely, numbers arrive as strings, and ownership and timestamps are
server-assigned — never accepted from the client:

```ts
export const thingFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
  body: z.string().max(10_000).optional().default(""),
  pinned: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
});
```

Conventions: money as integer cents; dates as ISO strings; soft delete via
`deletedAt` rather than removing rows.

## Migrations

`npm run gen` runs `drizzle-kit generate` (diffs the schema, writes SQL into
`drizzle/`) and `wrangler types`. Commit what it generates and never hand-edit
it — the snapshot in `drizzle/meta/` must stay in step or the next diff is
wrong.

`npm run migrate:local` applies migrations to the local D1. In production the
Deploy command applies them immediately before the new code goes live, so a
schema change ships with the code that needs it.

A site whose public pages work but whose first database query fails has
almost always never been migrated — the public pages never touch D1, so
registration is the first thing to hit it. `worker/lib/errors.ts` detects that
case and says so rather than returning the raw driver error.

D1 migrations are forward-only. A destructive change needs a forward fix, not
a rollback. SQLite cannot drop or retype a column in place, so a rename is
usually: add the new column, backfill, then stop referencing the old one.

## Routes

```tsx
export const thingsRoute = new Hono<AppEnv>();
const access = new AccessControl();

thingsRoute.use("*", requireUser);

thingsRoute.get("/", async (c) => { … });
thingsRoute.get("/new", async (c) => { … });
thingsRoute.post("/", zValidator("form", thingFormSchema), async (c) => { … });
thingsRoute.get("/:id/edit", async (c) => { … });
thingsRoute.post("/:id", zValidator("form", thingFormSchema), async (c) => { … });
thingsRoute.delete("/:id", async (c) => { … });
```

`new Hono<AppEnv>()` is what types `c.env` and `c.var`. Available in `c.var`:

|                    |                                                             |
| ------------------ | ----------------------------------------------------------- |
| `c.var.db`         | Drizzle client bound to D1                                  |
| `c.var.auth`       | `Auth` service; `c.var.auth.user` is the `SafeUser` or null |
| `c.var.app`        | Branding: `name`, `tagline`, `locale`, `currency`, `origin` |
| `c.var.authConfig` | Parsed auth + RBAC config                                   |

Apply guards with `.use("*", …)` on the router rather than repeating them per
route — one missed route is a hole.

**Validation errors.** Pass a third argument to `zValidator` to re-render the
form instead of returning a bare 400:

```tsx
zValidator("form", thingFormSchema, (result, c) => {
  if (!result.success) {
    const errors = Object.fromEntries(
      result.error.issues.map((i) => [String(i.path[0]), i.message]),
    );
    return c.html(<ThingFormPage errors={errors} />, 422);
  }
});
```

## Responding to HTMX

`htmxResponse(c, title, fragment)` returns the fragment for an `HX-Request` and
the full page otherwise, so one handler serves an AJAX swap, a direct visit and
a refresh.

| Helper                             | Use                                         |
| ---------------------------------- | ------------------------------------------- |
| `htmxResponse(c, title, fragment)` | Any GET that renders                        |
| `htmxToast(c, msg, { type })`      | Toast on _this_ response                    |
| `flashToast(c, msg, { type })`     | Toast that survives a `c.redirect(...)`     |
| `htmxRedirect(c, url)`             | Sets `HX-Redirect` — full client navigation |
| `htmxPushUrl(c, url)`              | Updates the URL bar during a swap           |
| `htmxTrigger(c, events)`           | Fires a client event                        |
| `isHtmxRequest(c)`                 | When you need to branch explicitly          |

Types are `"success" | "error" | "info" | "warning"`.

Create and update usually redirect (`flashToast` then `c.redirect`). Delete
usually returns an empty body with `htmxToast`, letting the `hx-swap="outerHTML"`
on the row remove it:

```tsx
htmxToast(c, "Thing deleted");
return c.body(null, 200);
```

To update something outside the swap target — a count in the navbar — render
that element with `hx-swap-oob="outerHTML"` in the same response.

## Services

Put logic in `worker/services/` when it is shared across routes or complex
enough to deserve its own tests. A `where` clause does not need a service;
`notes.tsx` queries Drizzle directly and that is correct.

Existing services: `auth.service.ts` (login, registration, WebAuthn, TOTP,
sessions, audit logging), `roles.service.ts` (effective permissions, merging
role-inherited and direct grants, honouring expiry), `access.service.ts`
(per-row authorisation).

## Authentication

Configured entirely through `wrangler.jsonc` vars — `AUTH_METHODS` decides
which of password, PIN, TOTP and passkey a site offers. Disabled methods
disappear from the UI and their API routes return 404; you never delete code to
turn one off.

Sessions are a stateless HS256 JWT in an httpOnly `auth_token` cookie. Roles
and permissions are re-read from the database on every request, so revoking a
role takes effect immediately rather than at next login.

**`Auth.toSafeUser()` is the only way a user object leaves the auth service.**
It strips `passwordHash`, `pin` and `totpSecret` and hydrates roles and
permissions. Returning a raw `users` row leaks credentials — this has happened
before in this codebase.

`BOOTSTRAP_ADMIN_EMAIL` grants `admin` to that address on registration, but
only while no admin exists, so it disarms itself. Do not loosen those
conditions — it is the no-terminal path to a first admin, not a back door.

Brute force has two layers: `RATE_LIMITER` caps auth requests per IP at the
edge, and `MAX_FAILED_LOGIN_ATTEMPTS` locks the individual account. The second
matters more — an attacker can rotate IPs but not the target account.

## Authorisation

Two layers answering different questions.

**Guards** — may this user reach this router?

```tsx
router.use("*", requireUser);
router.use("*", requireRole("admin"));
router.use("*", requirePermission("things.delete"));
```

Each answers an HTMX request with `HX-Redirect` and a normal request with a
302, so a rejected fetch behaves sensibly either way.

**`AccessControl`** — may they act on this row?

```tsx
access.authorize(user, "things", "update", existing.userId);
```

Admin bypasses. A `things.update.any` permission grants across owners. A plain
`things.update` additionally requires `user.id === ownerId`. Throws a 403
`HTTPException` on failure. Add each new resource to the `Resource` union in
`access.service.ts`.

**Scope reads in the query**, not after:

```tsx
.where(and(eq(thing.userId, user.id), isNull(thing.deletedAt)))
```

An unauthorised row should never be loaded. For a route where admins see
everything, make the clause conditional rather than dropping it:

```tsx
const isAdmin = user.roles.includes("admin");
.where(and(isAdmin ? undefined : eq(thing.userId, user.id), isNull(thing.deletedAt)))
```

## Configuration

`wrangler.jsonc` vars are strings; `config.middleware.ts` parses them into
typed objects once per request. Adding a var means adding it to `Vars` in
`worker/types.ts` too, so it is typed at the call site.

RBAC vars: `ROLES_AVAILABLE`, `ROLES_DEFAULT`, `ROLES_RESTRICTED` (cannot be
self-assigned at registration), `PERMISSIONS_AVAILABLE`, and `ROLES_INHERENT`
in the form `role:perm,perm;role:*`. A `*` expands to everything in
`PERMISSIONS_AVAILABLE`.

Units: `SESSION_DURATION` and `LOCKOUT_DURATION` are **milliseconds**;
`JWT_EXPIRY` is **seconds**. Nothing validates a plausible-looking number.

`validateAuthConfig()` catches structural mistakes — a default role missing
from `ROLES_AVAILABLE`, TOTP enabled with no issuer.

## Errors

Route handlers should not return a caught error's `message` to the client.
Drizzle wraps a D1 failure as `Failed query: <the whole SQL>` with the real
reason on `.cause`, so returning it verbatim hands out the schema and tells
the caller nothing — while the operator gets nothing in the logs either.

`worker/lib/errors.ts` handles both halves:

```ts
return c.json({ error: logAndSanitise("auth.register", error) }, 400);
```

It logs the flattened cause chain and returns either the deliberate message
(a plain `new Error("Email already registered")` from a service) or a generic
one for anything carrying a `cause` or SQL. The classification errs towards
generic, so the worst case is a vaguer message rather than a leak. Logs appear
in `wrangler tail` and in the dashboard under Workers Logs.

## Performance

The thing that dominates a Workers request is D1 round trips. The Worker itself
is fast; each query is a network hop, so latency is roughly "number of
sequential queries × round trip".

- **Never `await` independent queries in sequence.** Two `await`s in a row are
  two round trips; `Promise.all` makes them one wall-clock hop. This was the
  single biggest cost in this codebase — the auth path ran four sequential
  queries, one of them a duplicate, on *every* authenticated request.
- **Fetch once and pass it down.** `RoleService.getRolesAndPermissions()`
  returns both halves from one query pair because both derive from the same
  tables; asking for them separately read `user_roles` twice.
- **Count the queries a page costs.** A list view that fetches rows and a
  count is two; if the count can come from the rows you already have, it is
  one. Beware a query inside a `.map()` — that is one round trip per row.
- **`c.var.auth.user` is already resolved** by the auth middleware. Re-reading
  the user in a route is a wasted query.
- **Indexes matter on the columns you filter by.** `ownershipColumns` gives you
  `userId`; add `index("thing_user_idx").on(table.userId)` for anything scoped
  by owner, as `note.schema.ts` does.

Client-side: everything the browser runs is one same-origin bundle, and the
theme uses system font stacks, so a page paints without waiting on any external
request. Keep it that way — a font CDN or a script tag reintroduces exactly the
blocking third-party dependency this avoids.

## Testing

`tests/ui-pages.test.ts` asserts every route renders and that guards redirect.
Add new paths there — it is the cheapest way to catch a view importing
something a route no longer provides, which is the characteristic failure of
this architecture.

`tests/utils/fakeDb.ts` is a deliberately dumb Drizzle stand-in: it replays
fixtures based on which table a query selected `from`, and matches joined
selections by their alias keys. Add a fixture array and a `case` for a new
table. For real query behaviour, test against local D1 with
`npx wrangler d1 execute DB --local --command "…"` rather than making the fake
smarter — it is a smoke-test harness, not a database.
