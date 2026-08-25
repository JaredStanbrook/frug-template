# Changelog

All notable changes to this template are documented here.
This project follows Semantic Versioning.

## [Unreleased]

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

### Removed

- The originating application's domain: properties, rooms, tenancies,
  invoices, expenses, bonds, rent, billing and PDF generation.
- The legacy `wrangler.toml`, which duplicated and contradicted
  `wrangler.jsonc`.
- Committed secrets and live resource identifiers; `wrangler.jsonc` now ships
  placeholders only.
