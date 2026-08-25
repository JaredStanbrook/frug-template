# Repository Guidelines

**Start with the `frugal` skill** (`.claude/skills/frugal/`) when building or
styling anything here. It covers the frontend/backend split, the registration
steps a new feature needs in order to be reachable, and the theme-token rules
that keep light and dark mode working. This file is the short version.

This repository is a **template**. Code here is copied into new sites, so
changes should stay generic — resist encoding one site's domain into it.

## Project Structure & Module Organization

- `worker/` is the application: Hono routes, SSR JSX views, HTMX fragments,
  middleware, services and schema.
  - `worker/routes/` feature-grouped routes, `worker/views/` pages and
    components, `worker/components/` client-side Lit elements,
    `worker/services/` business logic, `worker/schema/` Drizzle + Zod,
    `worker/config/` env-driven configuration.
- `drizzle/` holds generated migrations for Cloudflare D1. Commit them.
- `public/` is copied into the client build and served by the `ASSETS` binding.
- Root configs: `wrangler.jsonc`, `drizzle.config.ts`, `vite.config.ts`,
  `tsconfig.json`.

Path aliases: `@server/*` → `worker/*`, `@views/*` → `worker/views/*`,
`@components/*` → `worker/components/*`.

## Build, Test, and Development Commands

- `npm run dev` — Vite dev server with hot reload on `:3000`.
- `npm run build` — generate types, typecheck, build client and server bundles.
- `npm run deploy` — migrate then deploy; this is the dashboard's Deploy command.
- `npm run configure -- --help` — fill in `wrangler.jsonc` for a new site.
- `npm run typecheck` — `tsc -b`.
- `npm run lint` — ESLint across the repo.
- `npm run test` — Vitest.
- `npm run gen` — regenerate Drizzle migrations and `worker-configuration.d.ts`.
  Run after **any** change to `worker/schema/` or `wrangler.jsonc`.
- **Regenerating `package-lock.json`: use `npm install --package-lock-only`.**
  A plain `npm install` records only the optional platform binaries matching
  the machine it ran on (`@tailwindcss/oxide-*`, `@esbuild/*`, `@rollup/*`,
  `lightningcss-*`, `@img/sharp-*`). The lockfile then has those packages
  listed under a parent's `optionalDependencies` with no matching
  `node_modules/...` entry, and Cloudflare's `npm clean-install` aborts with
  `Missing: <pkg> from lock file`. A local `npm ci` may still pass, so this
  does not always show up before the deploy — check that a cross-platform
  entry such as `node_modules/@tailwindcss/oxide-darwin-arm64` exists.
- `npm run migrate:local` — apply D1 migrations locally.
- `npm run preview` — build and run the real worker under Wrangler.

## Coding Style & Naming Conventions

- TypeScript only. Two-space indent, double quotes, semicolons, 100-column
  print width (Prettier enforces this; run `npm run format:write`).
- Feature-based folders under `worker/routes/`; keep JSX fragments small.
- Prefer server-rendered HTMX fragments. Reach for a Web Component only when
  client state is genuinely unavoidable.
- Money is integer cents. Dates are ISO strings in the database.
- Soft-delete with `deletedAt` rather than removing rows.

## Testing Guidelines

- Vitest, run with `npm run test`. Tests live in `tests/`, named `*.test.ts`.
- `tests/ui-pages.test.ts` asserts every route renders and that guards
  redirect. Add a path there whenever you add a page — it is the cheapest way
  to catch a view importing something a route no longer provides.
- `tests/utils/fakeDb.ts` is a deliberately dumb Drizzle stand-in: it replays
  fixtures based on which table was selected `from`. For real query behaviour,
  test against local D1 with `npx wrangler d1 execute DB --local`.

## Configuration & Security

- Copy `.dev.vars.example` to `.dev.vars` for local secrets. It is git-ignored.
- `JWT_SECRET` is set as a **Secret** in the Cloudflare dashboard — never as a
  `var` in `wrangler.jsonc`, and never as a _Build_ variable (those exist only
  during the build). See `docs/deploy.md`.
- Deployment is Cloudflare's Git integration: it runs `npm run build` then
  `npm run deploy` (migrate, then deploy) on every push. There is no deploy
  step a human runs, so keep both scripts working under plain npm — no
  `bunx`/`bun run` inside package.json scripts.
- `npm run build` runs `wrangler types` first, because
  `worker-configuration.d.ts` is generated rather than committed and the
  build container starts without it. Do not remove that step.
- The first admin comes from `BOOTSTRAP_ADMIN_EMAIL` (see
  `Auth.resolveBootstrapRole`), which only fires while no admin exists. Do not
  loosen those conditions.
- `SESSION_DURATION` and `LOCKOUT_DURATION` are milliseconds; `JWT_EXPIRY` is
  **seconds**. Mixing them up is silent and gives multi-year sessions.
- `RP_ID` and `ORIGIN` must match the deployed domain or passkeys fail silently.
- Never return a raw `users` row. `Auth.toSafeUser()` strips `passwordHash`,
  `pin` and `totpSecret`; every exit from the auth service goes through it.
- Scope queries by owner in the `where` clause, not only in a post-hoc check.
- Report security issues per `SECURITY.md`.

## Commit & Pull Request Guidelines

- Conventional Commits, as described in `CONTRIBUTING.md`.
- Keep PRs focused; note any schema or migration changes explicitly.
- Include before/after screenshots for user-visible UI changes.

## Runtime & Architecture Notes

- Runtime is Cloudflare Workers; SSR via Hono JSX with HTMX for interactivity.
- Drizzle + Zod define the database and validation contracts in
  `worker/schema/` — change the table, then regenerate rather than hand-editing
  migrations or duplicating validators.
- See `architecture.md` for the request lifecycle and the reasoning behind the
  layering.
