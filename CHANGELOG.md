# Changelog

All notable changes to this template are documented here.
This project follows Semantic Versioning.

## [Unreleased]

### Deployment model

The repo is now designed to go from template to live site **without a
terminal**: Claude prepares the repo, and Cloudflare's Git integration builds,
migrates and deploys on every push. See `docs/deploy.md`.

- `npm run deploy` — `wrangler d1 migrations apply DB --remote && wrangler
deploy`. This is the Deploy command to paste into the dashboard; the default
  `npx wrangler deploy` would ship code against an un-migrated schema.
- `npm run build` runs `wrangler types` first, so the build works in a
  container that starts without the generated (git-ignored)
  `worker-configuration.d.ts`.
- `BOOTSTRAP_ADMIN_EMAIL` — registering with this exact address grants `admin`,
  but only while no admin exists, so it disarms itself permanently on first
  use. Replaces `create-admin` as the first-admin path, since that needed a
  CLI. Explicit `"role": "admin"` at registration is still rejected.
- `scripts/configure.ts` (`npm run configure`) rewrites every placeholder in
  `wrangler.jsonc` from a few flags, validates the ids, and reports whatever is
  still unset. Intended to be run by Claude from values pasted into chat.
- `docs/deploy.md` replaces `docs/provisioning.md`, written around the
  dashboard rather than the CLI, with a build-failure table, a no-CLI manual
  migration fallback, and rollback notes.
- All `package.json` scripts are runtime-agnostic — no `bunx`/`bun run` — so
  Cloudflare's build image runs them whichever package manager it selects.
- npm is now the canonical package manager (`package-lock.json` committed,
  `bun.lock` removed) because it is what the build image detects most
  reliably. Bun still works locally.
- `.node-version` is `24.18.0`, a version preinstalled in the build image; it
  was `20.11.1`, which is not.
- CI and release workflows moved to Node/npm. The GitHub deploy workflow was
  removed — Cloudflare deploys now, and two deploy paths racing each other is
  worse than one.
- The `env.staging` block was removed. The dashboard flow is one Worker, one
  connected repo, one deploy command; `docs/deploy.md` has an appendix on
  adding staging back, including that named environments inherit nothing.

### Dependencies

- `@hono/zod-validator` 0.5 → 0.9. 0.5 declares a peer dependency on zod 3
  while this project uses zod 4; Bun tolerated it, npm refuses to install,
  which would have broken the Cloudflare build outright.
- `drizzle-orm` 0.43 → 0.45.2, clearing a high-severity advisory. Verified the
  generated migration SQL is byte-identical.
- Dropped `bun-types`; added `tsx` to run the repo's scripts under Node.
  `scripts/create-admin.ts` no longer uses Bun-only APIs.

### Added

- Initial template extracted from a production Cloudflare Workers application.
- Multi-method authentication: password, PIN, TOTP and passkey/WebAuthn, with
  account lockout, session limits and an `auth_logs` audit trail.
- Role-based access control: roles, role-inherited permissions and per-user
  grants with expiry, all declared through Cloudflare vars.
- `worker/config/app.config.ts` so per-site branding, locale and currency are
  configuration rather than code edits.
- `notes` example feature — a complete vertical slice (schema, validation,
  guarded routes, ownership checks, HTMX fragments, soft deletes) to copy and
  then delete.
- Admin-gated `/dev` database inspector and `/admin/logs` audit view.
- Vitest smoke tests covering every route, signed out and signed in.
- `.dev.vars.example` for local secrets.
- `docs/provisioning.md` — every binding and secret, with the four ways to
  supply each: wrangler CLI, Cloudflare dashboard, GitHub Actions secret, or
  `.dev.vars`. Includes a per-site checklist and the binding-vs-var-vs-secret
  distinction.
- `wrangler.jsonc` now mirrors a real production layout: production at the top
  level, an optional `env.staging` block, and inline notes on which values are
  per-site and how to obtain them.
- `RATE_LIMITER` binding, wired into the auth API as a per-IP throttle that
  runs before any database work. Skipped when the binding is absent so local
  dev and tests are unaffected.
- `.github/workflows/deploy.yml` — manual (or push-triggered) deploy using
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, migrating before deploying.
- `ENVIRONMENT` var, so code can tell production from staging.
- `bun run migrate:staging`.

### Changed

- Auth service now routes every user object through `toSafeUser()`, which
  strips `passwordHash`, `pin` and `totpSecret` and hydrates roles and
  permissions. Login responses previously returned the raw database row.
- `RoleService.getUserPermissions()` expands a `*` grant to every permission in
  `PERMISSIONS_AVAILABLE`, so `requirePermission` works for wildcard roles.
- JWT signing and verification share an explicit `HS256` constant, required by
  current Hono versions.
- `/dev` requires the `admin` role; it was previously unauthenticated.
- Currency and date formatting take locale and currency from `APP_LOCALE` and
  `APP_CURRENCY` instead of hard-coded values.
- `deploy:staging` ran `migrate:remote`, which targets **production** — a
  staging deploy would migrate the live database. It now runs `migrate:staging`.
- The `migrate:*` scripts and `create-admin` target the `DB` **binding** rather
  than a hard-coded database name, so they need no editing per site.
- `JWT_EXPIRY` is documented as **seconds** at every mention. It sets the JWT
  `exp` claim and the cookie `Max-Age` directly, so a pasted millisecond value
  (`86400000`) yields a ~2.7 year session instead of a day.
- `assets.not_found_handling` is `none` rather than `single-page-application`.
  This app server-renders every route, so the SPA fallback was swallowing 404s
  that should reach the worker's own handler.

### Removed

- The originating application's domain: properties, rooms, tenancies,
  invoices, expenses, bonds, rent, billing and PDF generation.
- The legacy `wrangler.toml`, which duplicated and contradicted
  `wrangler.jsonc`.
- Committed secrets and live resource identifiers; `wrangler.jsonc` now ships
  placeholders only.
