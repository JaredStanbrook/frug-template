# Repository Guidelines

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

- `bun dev` — Vite dev server with hot reload on `:3000`.
- `bun run build` — typecheck, then build client and server bundles.
- `bun run typecheck` — `tsc -b`.
- `bun run lint` — ESLint across the repo.
- `bun run test` — Vitest.
- `bun run gen` — regenerate Drizzle migrations and `worker-configuration.d.ts`.
  Run after **any** change to `worker/schema/` or `wrangler.jsonc`.
- `bun run migrate:local` — apply D1 migrations locally.
- `bun run preview` — build and run the real worker under Wrangler.

## Coding Style & Naming Conventions

- TypeScript only. Two-space indent, double quotes, semicolons, 100-column
  print width (Prettier enforces this; run `bun run format:write`).
- Feature-based folders under `worker/routes/`; keep JSX fragments small.
- Prefer server-rendered HTMX fragments. Reach for a Web Component only when
  client state is genuinely unavoidable.
- Money is integer cents. Dates are ISO strings in the database.
- Soft-delete with `deletedAt` rather than removing rows.

## Testing Guidelines

- Vitest, run with `bun run test`. Tests live in `tests/`, named `*.test.ts`.
- `tests/ui-pages.test.ts` asserts every route renders and that guards
  redirect. Add a path there whenever you add a page — it is the cheapest way
  to catch a view importing something a route no longer provides.
- `tests/utils/fakeDb.ts` is a deliberately dumb Drizzle stand-in: it replays
  fixtures based on which table was selected `from`. For real query behaviour,
  test against local D1 with `wrangler d1 execute --local`.

## Configuration & Security

- Copy `.dev.vars.example` to `.dev.vars` for local secrets. It is git-ignored.
- `JWT_SECRET` is set with `wrangler secret put` in production — never as a
  `var` in `wrangler.jsonc`. See `docs/provisioning.md` for every binding and
  secret, and the four ways to supply each.
- Production is the **top level** of `wrangler.jsonc`; `env.staging` is a
  separate worker script that **inherits nothing** — every binding and var is
  repeated there deliberately, and its secrets are set with `--env staging`.
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
