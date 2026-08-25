# frug-template

A production-shaped starter for Cloudflare Workers websites: Hono on the edge,
server-rendered JSX with HTMX, D1 + Drizzle, and a complete authentication and
RBAC system that is configured rather than written.

It is the platform layer extracted from a real application, so the parts that
are tedious to get right — passkeys, TOTP, account lockout, permission checks,
migrations, the build pipeline — are already done and already tested.

```
bun install
cp .dev.vars.example .dev.vars     # then set JWT_SECRET
bun run migrate:local
bun run create-admin:local --email you@example.com --generate
bun dev                            # http://localhost:3000
```

---

## What you get

| Area        | What's included                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**    | Password, PIN, TOTP and passkey/WebAuthn sign-in. Failed-attempt lockout, session limits, an `auth_logs` audit trail. Which methods a site offers is one env var.                     |
| **RBAC**    | Roles, per-role inherited permissions, per-user grants with expiry. `requireUser`, `requireRole`, `requirePermission` middleware and an `AccessControl` service for ownership checks. |
| **Data**    | Cloudflare D1 with Drizzle ORM. Zod validators derived from the same table definitions, so a schema change propagates to validation and types.                                        |
| **UI**      | Hono JSX server rendering, HTMX for partial updates, Tailwind v4, light/dark/system theming, toasts, dialogs. Lit Web Components only where client state is unavoidable.              |
| **Tooling** | Vite build for client and worker bundles, TypeScript project references, ESLint, Prettier, Vitest smoke tests, GitHub Actions CI.                                                     |

---

## Starting a new site

Everything site-specific is configuration. Work top to bottom:

### 1. Create the Cloudflare resources

```bash
bunx wrangler d1 create my-site-db
bunx wrangler kv namespace create KV
bunx wrangler r2 bucket create my-site-files   # only if you need file storage
```

Each command prints an id. Keep them for the next step.

### 2. Fill in `wrangler.jsonc`

Every value that must change is marked `CHANGE_ME` or `change-me`:

| Field                              | Set it to                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `name`                             | The worker name, e.g. `my-site`                                                                                                  |
| `routes`                           | Uncomment and set your custom domain, or delete to use `*.workers.dev`                                                           |
| `vars.APP_NAME` / `APP_TAGLINE`    | How the site names itself in the nav, title and footer                                                                           |
| `vars.APP_LOCALE` / `APP_CURRENCY` | Date and money formatting                                                                                                        |
| `vars.RP_ID` / `vars.ORIGIN`       | **Must match your real domain** or passkeys silently fail. `RP_ID` is the bare hostname; `ORIGIN` is the full origin with scheme |
| `vars.TOTP_ISSUER`                 | The name shown in authenticator apps                                                                                             |
| `d1_databases[0]`                  | `database_name` and `database_id` from step 1                                                                                    |
| `kv_namespaces[0].id`              | The KV id from step 1                                                                                                            |
| `r2_buckets[0]`                    | Your bucket name, or delete the block and `R2` from `worker/types.ts`                                                            |

Then update `migrate:local` / `migrate:remote` in `package.json` to use your
database name.

### 3. Set the secret

`JWT_SECRET` signs session cookies. It must never live in `wrangler.jsonc`.

```bash
openssl rand -base64 48                # generate
bunx wrangler secret put JWT_SECRET    # production
echo 'JWT_SECRET="<value>"' > .dev.vars  # local (git-ignored)
```

Anyone with this value can mint a session for any user. Rotate it by setting a
new one — every existing session is invalidated, which is the intended effect.

### 4. Define roles and permissions

Still in `wrangler.jsonc`. The template ships a `user` / `admin` pair:

```jsonc
"ROLES_AVAILABLE": "user,admin",     // every role the system understands
"ROLES_DEFAULT": "user",             // assigned at registration
"ROLES_RESTRICTED": "admin",         // cannot be self-assigned via the API
"PERMISSIONS_AVAILABLE": "posts.read,posts.create,posts.update,posts.delete,posts.update.any,posts.delete.any",
"ROLES_INHERENT": "user:posts.read,posts.create;admin:*"
```

The convention: `resource.action` grants the action **on rows you own**, and
`resource.action.any` grants it on anyone's. `*` expands to everything in
`PERMISSIONS_AVAILABLE`. Mirror the resource names in the `Resource` type in
`worker/services/access.service.ts`.

### 5. Choose auth methods

```jsonc
"AUTH_METHODS": "password,passkey,totp"   // any of: passkey, password, pin, totp, email, sms
```

Disabled methods disappear from the login and register UI and their API routes
return 404 — you do not need to delete code to turn one off.

### 6. Migrate, seed, deploy

```bash
bun run migrate:remote
bun run create-admin:remote --email you@example.com --generate
bun run deploy:prod
```

`create-admin` is the bootstrap path for the first `admin` user, since `admin`
is in `ROLES_RESTRICTED` and cannot be granted through registration.

### 7. Make it yours

- Replace `worker/views/pages/Home.tsx` with a real landing page.
- Replace `public/favicon.svg`.
- Edit `menuConfig` in `worker/views/components/NavBar.tsx` to add nav links.
- Delete the Notes example (below) once you've copied its shape.

---

## Adding a feature

The `notes` feature is a complete worked example — schema, validation,
guarded routes, ownership checks, HTMX fragments and soft deletes — in four
small files. To build your own, copy its shape:

1. **Schema** — `worker/schema/note.schema.ts`. Define the Drizzle table,
   spread `ownershipColumns` for `userId` + timestamps, and derive Zod
   schemas with `drizzle-zod`.
2. **Migration** — `bun run gen`, then `bun run migrate:local`.
3. **Views** — `worker/views/notes/NoteComponents.tsx`. Pure functions of
   props; no data access. Give every HTMX-swappable fragment a stable `id`.
4. **Routes** — `worker/routes/notes.tsx`. Guard with `requireUser`, validate
   with `zValidator`, authorize with `AccessControl`, respond with
   `htmxResponse`.
5. **Mount** — add the router in `worker/app.tsx` and a nav link in `NavBar.tsx`.
6. **Permissions** — add the strings to `PERMISSIONS_AVAILABLE` and the
   resource to the `Resource` type.

Then delete the notes files: `worker/schema/note.schema.ts`,
`worker/routes/notes.tsx`, `worker/views/notes/`, and its references in
`worker/app.tsx`, `worker/routes/dev.tsx` and `NavBar.tsx`.

---

## Commands

| Command                                  | Does                                             |
| ---------------------------------------- | ------------------------------------------------ |
| `bun dev`                                | Vite dev server with hot reload at `:3000`       |
| `bun run preview`                        | Build, then run the real worker under Wrangler   |
| `bun run build`                          | Typecheck, then build client and server bundles  |
| `bun run typecheck`                      | `tsc -b`                                         |
| `bun run lint`                           | ESLint                                           |
| `bun run format:write`                   | Prettier                                         |
| `bun run test`                           | Vitest                                           |
| `bun run gen`                            | Regenerate Drizzle migrations and Wrangler types |
| `bun run migrate:local` / `:remote`      | Apply D1 migrations                              |
| `bun run create-admin:local` / `:remote` | Create or promote an admin user                  |
| `bun run deploy:staging` / `:prod`       | Migrate, build and deploy                        |

Run `bun run gen` after **any** change to `worker/schema/` or `wrangler.jsonc` —
it regenerates both the SQL migration and `worker-configuration.d.ts`.

---

## Layout

```
worker/
  index.ts          Worker entry: CORS, global middleware, error handling
  app.tsx           Router — mount feature routers here
  types.ts          Bindings (KV/DB/R2/vars) and request-scoped Variables
  config/           app.config.ts (branding), auth.config.ts (auth + RBAC)
  middleware/       config, db, auth, guard (RBAC), renderer (SSR layout)
  schema/           Drizzle tables + Zod validators
  services/         auth.service, roles.service, access.service
  routes/           web/ (pages), api/ (JSON), admin/ (RBAC-gated), notes.tsx
  views/            Layout, pages/, components/, per-feature folders
  components/       Client-side Lit Web Components + main.ts entry
  lib/              crypto, htmx-helpers, utils
drizzle/            Generated migrations — commit these
scripts/            create-admin.ts
tests/              Vitest smoke tests
```

Path aliases: `@server/*` → `worker/*`, `@views/*` → `worker/views/*`,
`@components/*` → `worker/components/*`.

---

## Conventions

- **Money is integer cents.** Convert at the edges with `dollarsToCents` and
  `formatCents`; never store or arithmetic on floats.
- **Soft delete.** Set `deletedAt` and filter with `isNull(...)` rather than
  deleting rows, so audit history survives.
- **Server-render first.** Reach for HTMX fragments before a Web Component.
  Components in `worker/components/` are for state the server genuinely cannot
  hold — WebAuthn ceremonies, theme preference, modals.
- **Never return a raw `users` row.** `Auth.toSafeUser()` strips
  `passwordHash`, `pin` and `totpSecret` and hydrates roles and permissions.
  Every path out of the auth service goes through it.
- **`/dev` is admin-gated** because it dumps every table. Delete the router
  for sites handling sensitive data.

---

## Security checklist before going live

- [ ] `JWT_SECRET` set via `wrangler secret put`, not in `wrangler.jsonc`
- [ ] `RP_ID` and `ORIGIN` match the production domain exactly
- [ ] `ALLOWED_EMAILS` set if registration should be invite-only
- [ ] `ROLES_RESTRICTED` includes every privileged role
- [ ] The first admin created via `create-admin`, not self-registration
- [ ] `/dev` router deleted or confirmed admin-only
- [ ] `bun run lint && bun run typecheck && bun run test` all green
