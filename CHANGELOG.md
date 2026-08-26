# Changelog

All notable changes to this template are documented here.
This project follows Semantic Versioning.

## [Unreleased]

First release. The template is the platform layer of a production Cloudflare
Workers application, with that application's domain removed, designed so a new
site goes from template to live without a terminal.

### The template

- Hono on Cloudflare Workers: server-rendered JSX, HTMX for partial updates,
  Tailwind v4, Lit Web Components only where client state is unavoidable.
- Multi-method authentication — password, PIN, TOTP, passkey/WebAuthn — with
  failed-attempt lockout, session limits and an `auth_logs` audit trail. Which
  methods a site offers is one variable.
- Role-based access control: roles, role-inherited permissions and per-user
  grants with expiry, all declared in `wrangler.jsonc`. `requireUser`,
  `requireRole` and `requirePermission` guards, plus an `AccessControl` service
  for per-row ownership checks.
- Cloudflare D1 with Drizzle ORM and Zod validators derived from the same table
  definitions, so a schema change propagates to validation and types.
- `worker/config/app.config.ts` — per-site branding, locale and currency are
  configuration, not code edits.
- A `notes` example feature: one complete vertical slice (schema, validation,
  guarded routes, ownership checks, HTMX fragments, soft deletes) to copy the
  shape of and then delete.
- Admin-gated `/dev` database inspector and `/admin/logs` audit view.
- `RATE_LIMITER` binding, wired into the auth API as a per-IP throttle ahead of
  any database work. Skipped when the binding is absent, so local dev and tests
  are unaffected.
- Vitest smoke tests covering every route, signed out and signed in.
- Vite build for client and worker bundles, ESLint, Prettier, GitHub Actions CI.

### Deploying without a terminal

The whole dev-to-prod cycle completes from a phone: Claude prepares the repo,
and Cloudflare's Git integration builds, migrates and deploys on every push.
Three dashboard steps are the only manual work. See `docs/deploy.md`.

- `npm run deploy` — `wrangler d1 migrations apply DB --remote && wrangler
deploy`. This is the Deploy command pasted into the dashboard; the default
  `npx wrangler deploy` would ship code against an un-migrated schema.
- `npm run build` runs `wrangler types` first, so the build succeeds in a
  container that starts without the generated, git-ignored
  `worker-configuration.d.ts`.
- `BOOTSTRAP_ADMIN_EMAIL` — registering with this exact address grants `admin`,
  but only while no admin exists, so it disarms itself permanently on first
  use. This is the first-admin path, because `create-admin` needs a CLI.
  Explicit `"role": "admin"` at registration is still rejected.
- `npm run configure` (`scripts/configure.ts`) rewrites every placeholder in
  `wrangler.jsonc` from a few flags, validates the ids, and reports whatever is
  still unset. Intended to be run by Claude from values pasted into chat.
- `docs/deploy.md` is the dashboard-first walkthrough, with a build-failure
  table, a no-CLI manual migration fallback via the D1 console, rollback notes,
  and an appendix on adding a staging environment.
- `wrangler.jsonc` ships production-only with placeholders and inline notes on
  where each value comes from. No staging block: the dashboard flow is one
  Worker, one connected repo, one deploy command.
- `ENVIRONMENT` var, so code can distinguish deployments.

### Self-hosted client assets

- HTMX and Lucide are bundled into `/static/client.js` instead of loaded from
  `cdn.jsdelivr.net` and `unpkg.com`. The page now makes no third-party request
  at runtime: it works offline, needs no `script-src` exception, and no longer
  depends on two external hosts staying up. `lucide@latest` was also unpinned,
  so the icon set could change under a deployed site without a commit.
- Icons are imported individually via `worker/components/lib/icons.ts`, so the
  bundle carries the ~30 in use rather than Lucide's ~1600. Total client
  JavaScript went from 528KB across three requests to 174KB in one — 67% less.
- `tests/icons.test.ts` fails the build for any `data-lucide` literal that is
  not registered, naming the file and the import to add; `renderIcons()` warns
  in the console for names built at runtime. Together these turn a silently
  invisible icon into a caught error.

### Build environment

Every item here would have broken the Cloudflare build:

- `@hono/zod-validator` 0.5 → 0.9. 0.5 peer-depends on zod 3 while this project
  uses zod 4; Bun tolerated the conflict, npm refuses to install at all.
- All `package.json` scripts are runtime-agnostic — no `bunx`/`bun run` — so the
  build image runs them whichever package manager it selects.
- npm is the canonical package manager (`package-lock.json` committed) because
  it is what the build image detects most reliably. Bun still works locally.
- `.node-version` is `24.18.0`, preinstalled in the build image. `20.11.1` is
  not.
- Dropped `bun-types`; added `tsx` so the repo's scripts run under Node.
  `scripts/create-admin.ts` no longer uses Bun-only APIs.

### Fixed, carried over from the source application

- Login responses returned the raw `users` row, exposing `passwordHash`. Every
  user object now exits the auth service through `toSafeUser()`, which strips
  `passwordHash`, `pin` and `totpSecret` and hydrates roles and permissions.
- The CSRF origin check was pinned to a hardcoded personal domain, via a regex
  whose alternation did not bind as intended. It now compares exactly against
  `ORIGIN` plus localhost.
- `/dev` dumped every table without authentication. It now requires `admin`.
- A `*` permission grant was stored literally, so `requirePermission` failed for
  wildcard roles. It now expands to `PERMISSIONS_AVAILABLE`.
- `verify` needs an explicit algorithm on current Hono versions; signing and
  verification now share one `HS256` constant.
- `deploy:staging` ran `migrate:remote`, which targets production — a staging
  deploy would have migrated the live database.
- `assets.not_found_handling` was `single-page-application`. This app
  server-renders every route, so the SPA fallback swallowed 404s that should
  reach the worker's own handler. Now `none`.
- `JWT_EXPIRY` is documented as **seconds** at every mention. It sets the JWT
  `exp` claim and the cookie `Max-Age` directly, so a millisecond value
  (`86400000`) yields a ~2.7 year session rather than a day.
- `drizzle-orm` 0.43 → 0.45.2, clearing a high-severity advisory. The generated
  migration SQL is byte-identical.
- CI ran `bun test` — Bun's own runner, not the vitest script — and lacked the
  step generating the types its typecheck depends on.

### Removed from the source application

- Its domain: properties, rooms, tenancies, invoices, expenses, bonds, rent,
  billing and PDF generation.
- The legacy `wrangler.toml`, which duplicated and contradicted
  `wrangler.jsonc`.
- Committed secrets and live resource identifiers. `wrangler.jsonc` ships
  placeholders only.
