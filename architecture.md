# Architecture

A full-stack application on **Hono** + **Cloudflare Workers**, server-rendered
with JSX and made interactive with **HTMX**. Everything runs in one worker:
there is no separate frontend build to deploy, no API gateway, no origin server.

## 1. Stack

| Layer             | Choice                                                                      | Why                                                        |
| ----------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Framework         | [Hono](https://hono.dev/)                                                   | Small, fast, first-class Workers support, JSX built in     |
| Runtime           | [Cloudflare Workers](https://workers.cloudflare.com/)                       | Runs at the edge, no servers to operate                    |
| Database          | [D1](https://developers.cloudflare.com/d1/)                                 | SQLite at the edge, same binding locally and in production |
| ORM               | [Drizzle](https://orm.drizzle.team/)                                        | Typed queries, migrations generated from the schema        |
| Cache / ephemeral | [KV](https://developers.cloudflare.com/kv/)                                 | WebAuthn challenges, short-lived state                     |
| Validation        | [Zod](https://zod.dev/)                                                     | Derived from Drizzle tables via `drizzle-zod`              |
| UI                | Hono JSX + [HTMX](https://htmx.org/) + [Tailwind](https://tailwindcss.com/) | Server-rendered by default; HTMX swaps fragments           |
| Islands           | [Lit](https://lit.dev/)                                                     | Only where client state is unavoidable                     |

---

## 2. Request lifecycle

Every request passes through the same pipeline, set up in `worker/index.ts`:

```
Request
  │
  ├─ logger            request logging
  ├─ cors              same-origin by default, widened deliberately
  ├─ configMiddleware  parse env vars → c.var.app, c.var.authConfig
  ├─ dbMiddleware      construct Drizzle client → c.var.db
  ├─ authMiddleware    read auth_token cookie, validate JWT → c.var.auth
  │
  ├─ app.tsx router
  │    ├─ globalRenderer   wraps SSR responses in Layout
  │    ├─ guards           requireUser / requireRole / requirePermission
  │    └─ route handler
  │
  └─ notFound → ASSETS.fetch (static client bundle, public/)
```

Config is parsed per request rather than at module scope because Workers
isolates are reused across requests but bindings arrive on the request. The
parse is cheap; correctness matters more.

---

## 3. Directories

### `worker/config/`

Turns Cloudflare's string-valued env vars into typed objects, once per request.

- **`app.config.ts`** — branding and formatting (`APP_NAME`, locale, currency).
  The one place a site is named.
- **`auth.config.ts`** — auth methods, session policy, lockout thresholds,
  password/PIN/TOTP/passkey rules, and the RBAC role/permission tables.
  `validateAuthConfig()` reports misconfiguration (a default role missing from
  `ROLES_AVAILABLE`, TOTP enabled with no issuer) rather than failing at runtime.

### `worker/schema/`

Drizzle tables and the Zod schemas derived from them. Because validators come
from `createInsertSchema`/`createSelectSchema`, a column change propagates to
validation and TypeScript types without a second edit.

- **`auth.schema.ts`** — `users`, `credentials` (passkeys), `sessions`,
  `verification_codes`, `auth_logs`.
- **`roles.schema.ts`** — `user_roles`, `role_permissions`, `user_permissions`,
  all with optional expiry.
- **`common.ts`** — `ownershipColumns`: the `userId` + `createdAt` + `updatedAt`
  triple that every owned table spreads.
- **`note.schema.ts`** — the example feature.

### `worker/services/`

Business logic, kept out of route handlers.

- **`auth.service.ts`** — multi-method login, registration, WebAuthn
  ceremonies, TOTP enrolment, session issue/validate/destroy, audit logging.
  `toSafeUser()` is the single exit point that strips credentials.
- **`roles.service.ts`** — resolves a user's effective permissions by merging
  role-inherited grants (expanding `*`) with direct grants, honouring expiry.
- **`access.service.ts`** — `authorize(user, resource, action, ownerId?)`.
  Admin bypasses; a `.any` permission grants across owners; a plain permission
  additionally requires ownership.

### `worker/middleware/`

- **`config`** / **`db`** / **`auth`** — populate `c.var` (see lifecycle above).
- **`guard`** — `requireUser`, `requireRole(...)`, `requirePermission(...)`.
  Each answers HTMX requests with `HX-Redirect` and plain requests with a 302,
  so a rejected fetch behaves sensibly in both worlds.
- **`renderer`** — `jsxRenderer` wrapping every SSR response in `Layout`, and
  the place to gather anything the shell needs on every page.

### `worker/routes/`

- **`web/`** — public server-rendered pages (home, login, register, logout).
- **`api/`** — JSON endpoints. Typed end-to-end: `app.tsx` exports `AppType`,
  and `worker/components/lib/utils.ts` builds a Hono RPC client from it, so
  client components get compile-time-checked API calls.
- **`admin/`** — mounted behind `requireRole("admin")` in `app.tsx`.
- **`dev.tsx`** — admin-gated database inspector.

### `worker/views/` and `worker/components/`

`views/` renders on the server and never touches the database. `components/`
ships to the browser as Lit elements, registered in `components/main.ts`.

The split matters: `views/` code runs in the Workers runtime, `components/`
code runs in the browser, and they are built by two separate Vite passes.

---

## 4. Rendering model

**Initial load** — Hono renders JSX to HTML. The client bundle is a small
progressive enhancement, not the application.

**Interaction** — HTMX issues a request; the route returns an HTML fragment.
`htmxResponse()` returns the fragment for an `HX-Request` and the full page
otherwise, so the same handler serves a swap and a direct visit or refresh.

**Feedback** — `htmxToast()` attaches a toast to the current response;
`flashToast()` writes a short-lived cookie so a message survives a redirect.
Both are consumed by the `<app-toaster>` element.

**Client state** — only where the server cannot hold it: WebAuthn ceremonies
(browser-only APIs), theme preference (`localStorage`), modals.

---

## 5. Authentication

```
Login → AuthService validates credentials against D1
      → optional TOTP challenge
      → JWT signed (HS256) with JWT_SECRET
      → set as httpOnly auth_token cookie
      → every later request: authMiddleware verifies and hydrates c.var.auth
```

Sessions are stateless: the JWT carries the subject and expiry, and the user's
roles and permissions are re-read from the database on each request. Revoking a
role takes effect immediately rather than at the next login.

`secure` and `SameSite` on the cookie are derived from whether the request
arrived over HTTPS, so local HTTP development works without weakening
production.

**Lockout** — `MAX_FAILED_LOGIN_ATTEMPTS` failures set `lockedUntil`, enforced
before any credential comparison.

**Audit** — every login, registration and TOTP event is written to `auth_logs`,
readable at `/admin/logs`.

---

## 6. Authorization

Two layers that answer different questions:

- **Route guards** (`requireRole`, `requirePermission`) — _may this user reach
  this page at all?_
- **`AccessControl.authorize()`** — _may this user act on this specific row?_

A route typically uses both: the guard admits the user, then `authorize` checks
ownership against the fetched row. Reads are additionally scoped in the query
itself (`where(eq(table.userId, user.id))`) so an unauthorized row is never
loaded in the first place.

---

## 7. Build and deploy

Two Vite passes from one config:

- `--mode client` → `dist/client/static/client.js` + `main.css`, plus `public/`
  copied alongside. Served by the `ASSETS` binding.
- default mode → the worker bundle, entry `worker/index.ts`.

`bun run build` typechecks first, so a broken build never reaches Wrangler.
`bun run deploy:prod` runs migrations, builds, and deploys in that order.

---

## 8. Security model

- **Credentials never leave the service.** `toSafeUser()` is the only way a
  user object exits `auth.service.ts`.
- **Passwords** are hashed with scrypt via WebCrypto (`worker/lib/crypto.ts`);
  comparisons are constant-time.
- **`JWT_SECRET`** is a Wrangler secret, never a `var`.
- **Input validation** is Zod on every form and API body, at the route boundary.
- **Data isolation** is enforced in the query, not only in the check.
- **CORS** is same-origin by default.
- **`/dev`** requires the `admin` role because it dumps every table.
