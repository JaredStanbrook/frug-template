# frug-template

A production-shaped starter for Cloudflare Workers websites: Hono on the edge,
server-rendered JSX with HTMX, D1 + Drizzle, and a complete authentication and
RBAC system that is configured rather than written.

It is the platform layer extracted from a real application, so the parts that
are tedious to get right — passkeys, TOTP, account lockout, permission checks,
migrations, the build pipeline — are already done and already tested.

**No computer required.** Ask Claude for the changes you want, then deploy from
the Cloudflare dashboard — Cloudflare builds, migrates and ships on every push.
The full walkthrough is **[docs/deploy.md](docs/deploy.md)**.

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

Three things in the Cloudflare dashboard; Claude does the rest.
**[docs/deploy.md](docs/deploy.md)** is the step-by-step version.

### 1. Create the resources (dashboard)

**Storage & Databases → D1 → Create**, and **→ KV → Create Instance**. Copy the
**Database ID** (a UUID) and the **Namespace ID** (32 hex). Add an R2 bucket
only if the site stores files.

These ids are not secrets — they are useless without an API token for your
account, which is why they live in version control.

### 2. Tell Claude (chat)

Paste the ids in and say what the site is called. Claude runs:

```bash
npm run configure -- \
  --name my-site --app-name "My Site" \
  --domain my-site.example.com \
  --d1-name my-site-db --d1-id <uuid> --kv-id <32-hex> \
  --admin-email me@example.com
```

which fills every placeholder in `wrangler.jsonc`, validates the ids, and
reports anything still unset. Then it commits and pushes.

### 3. Set the secret + connect the repo (dashboard)

**Settings → Variables and Secrets → Add**, type **Secret**, name
`JWT_SECRET`. Then **Settings → Builds → Connect**, pick the repo, and set:

| Field          | Value            |
| -------------- | ---------------- |
| Build command  | `npm run build`  |
| Deploy command | `npm run deploy` |

`npm run deploy` runs `wrangler d1 migrations apply DB --remote && wrangler
deploy`, so the schema is migrated immediately before the new code goes live.

### 4. Become the admin

Register on the live site with the email you passed as `--admin-email`. That
account is granted `admin` on sign-up, because `BOOTSTRAP_ADMIN_EMAIL` is set.

It only fires while **no admin exists**, so it disarms itself the moment it
works — no terminal, and no standing back door.

### 5. Make it yours

- Replace `worker/views/pages/Home.tsx` with a real landing page.
- Replace `public/favicon.svg`.
- Edit `menuConfig` in `worker/views/components/NavBar.tsx` to add nav links.
- Delete the Notes example (below) once you've copied its shape.

### Roles, permissions and auth methods

All of it is configuration in `wrangler.jsonc`:

```jsonc
"AUTH_METHODS": "password,passkey,totp",  // passkey, password, pin, totp, email, sms
"ROLES_AVAILABLE": "user,admin",
"ROLES_DEFAULT": "user",                  // assigned at registration
"ROLES_RESTRICTED": "admin",              // cannot be self-assigned via the API
"PERMISSIONS_AVAILABLE": "posts.read,posts.create,posts.update.any",
"ROLES_INHERENT": "user:posts.read,posts.create;admin:*"
```

`resource.action` grants the action **on rows you own**; `resource.action.any`
grants it on anyone's; `*` expands to everything in `PERMISSIONS_AVAILABLE`.
Mirror the resource names in the `Resource` type in
`worker/services/access.service.ts`.

Disabled auth methods vanish from the UI and their API routes return 404 — you
never delete code to turn one off.

---

## Adding a feature

The `notes` feature is a complete worked example — schema, validation,
guarded routes, ownership checks, HTMX fragments and soft deletes — in four
small files. To build your own, copy its shape:

1. **Schema** — `worker/schema/note.schema.ts`. Define the Drizzle table,
   spread `ownershipColumns` for `userId` + timestamps, and derive Zod
   schemas with `drizzle-zod`.
2. **Migration** — `npm run gen`. Cloudflare applies it on the next deploy.
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

You do not need any of these — Cloudflare runs the build and deploy. They are
here for local work, and for Claude to run on your behalf.

| Command                                  | Does                                                              |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `npm run configure -- --help`            | Fill in `wrangler.jsonc` for a new site                           |
| `npm run dev`                            | Vite dev server with hot reload at `:3000`                        |
| `npm run build`                          | Generate types, typecheck, build client + server bundles          |
| `npm run deploy`                         | Migrate, then deploy — **this is the dashboard's Deploy command** |
| `npm run preview`                        | Build, then run the real worker under Wrangler                    |
| `npm run typecheck`                      | `tsc -b`                                                          |
| `npm run lint`                           | ESLint                                                            |
| `npm run format:write`                   | Prettier                                                          |
| `npm run test`                           | Vitest                                                            |
| `npm run gen`                            | Regenerate Drizzle migrations and Wrangler types                  |
| `npm run migrate:local` / `:remote`      | Apply D1 migrations (targets the `DB` binding)                    |
| `npm run create-admin:local` / `:remote` | Create or promote an admin directly                               |

Run `npm run gen` after **any** change to `worker/schema/` or `wrangler.jsonc` —
it regenerates both the SQL migration and `worker-configuration.d.ts`.
`npm run build` regenerates the types on its own, which is why Cloudflare's
build works without the generated file being committed.

Bun works for all of these too; `package-lock.json` is committed because npm is
what Cloudflare's build image detects most reliably.

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

- [ ] `JWT_SECRET` set as a **Secret** in the dashboard — not a Variable, not a
      Build variable, never in `wrangler.jsonc`
- [ ] `RP_ID` and `ORIGIN` match the deployed hostname exactly
- [ ] `JWT_EXPIRY` is in **seconds** (`86400` = 24h), not milliseconds
- [ ] `ALLOWED_EMAILS` set if registration should be invite-only
- [ ] `ROLES_RESTRICTED` includes every privileged role
- [ ] Admin account created via the `BOOTSTRAP_ADMIN_EMAIL` flow, and the
      variable cleared afterwards
- [ ] `/dev` router deleted or confirmed admin-only
- [ ] `grep -in "change.me\|0000000" wrangler.jsonc` returns only comment lines
- [ ] `npm run lint && npm run typecheck && npm run test` all green
