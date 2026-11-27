# Changelog

All notable changes to this template are documented here.
This project follows Semantic Versioning.

Every change to the template is a release: bump `version` in `frugal.json`
and add a section here headed `## [<version>] - <date>`. CI refuses a pull
request that does neither, and merging to `main` tags the release `v<version>`.
Sites built from the template read these sections when they upgrade, so write
each one for a site owner: what changed, and anything they must do by hand.
See `docs/template-versions.md`.

## [0.6.1] - 2026-11-27

### Toasts

- **Toasts sent across a client-side redirect now appear.** "Login
  successful!", "Logged out successfully", "Account created successfully!"
  and every other `redirectWithToast` message were written to
  `sessionStorage` under a key nothing read, so they were never shown. They
  now go in the `flash-toast` cookie the server's `flashToast` already uses
  (listed in `cookies.config.ts` as strictly necessary), and the one reader
  shows both.
- Screen readers announce toasts (an `aria-live` region that is always on
  the page).
- A toast stops counting down while the pointer or keyboard focus is on it.
- Errors stay at least 8 seconds, however short a duration they were given.
- At most three at once, newest on top; the same message again restarts the
  one showing instead of stacking a copy.
- They now sit top right, under the nav, instead of bottom right, where they
  covered the cookie banner's buttons. A coloured edge marks the type, they
  use the `popover` theme tokens, and they slide away when closed (no motion
  with reduced motion on).
- Reading the flash cookie no longer throws when another cookie holds a
  stray `%`, and a message containing `;` is no longer cut in two.

**By hand:** nothing. If your own code read `sessionStorage.pending_toast`,
read the toast with `getFlashToast()` instead.

## [0.6.0] - 2026-11-27

### Email, password reset and confirming an address

The site can now send email, through **Cloudflare Email Service**, and uses it
for the two things every sign-in needs.

- **Forgot password.** The "Forgot password?" link on the sign-in page used
  to lead to a 404. `/forgot-password` now emails a link to
  `/reset-password`, where the owner chooses a new password. The link works
  once, for an hour, and only the newest one works. A reset signs the
  account out everywhere, lifts any lockout, and still asks for the
  authenticator code if the account has one. The form gives the same answer
  for every address, so it cannot be used to find out who has an account.
- **Confirm your email.** Every new account is sent a link to
  `/verify-email`. Opening it shows one button to press, so a mail scanner
  that opens links does not confirm an address on its own. The profile shows
  "Confirm your email" until then, and `/verify-email` can send the link
  again (at most once a minute).
- **`REQUIRE_EMAIL_VERIFICATION` now does something.** It was read and
  ignored. Set to `"true"`, a signed-in user with an unconfirmed address is
  sent to `/verify-email` from every page behind `requireUser`,
  `requireRole` or `requirePermission`. A new sign-up goes straight there.
- Reset and confirmation links are built on `ORIGIN`, never the request's
  Host header.
- **Reset codes are no longer written to the logs.** The old
  `requestPasswordReset` printed every live reset code with `console.log`,
  which Workers Logs keeps. Messages are now printed only when `ORIGIN` is
  localhost, which is how you follow a link during local development.
- The unused `sendVerificationCode` and `verifyCode` (six-digit codes,
  stored in the clear, from `Math.random`) are gone, replaced by the links
  above.
- Deleting an account now clears the session cookie. The sign-out it does
  was not awaited, so the cookie survived.

New pieces: `worker/services/email.service.ts` (`sendEmail`, `linkEmail`),
`worker/views/pages/EmailLinks.tsx`, and
`worker/middleware/rate-limit.middleware.ts` (the per-IP auth throttle, moved
out of `routes/api/auth.ts` so the new forms use it too). No schema change:
the links use the existing `verification_codes` table.

**By hand:**

1. Email is off until you set it up. Nothing breaks without it, but
   "Forgot password?" is hidden and new addresses stay unconfirmed. To turn
   it on, follow **Step 7 — Email** in `docs/deploy.md`: onboard your domain
   under Compute → Email Service, then set `EMAIL_FROM` in `wrangler.jsonc`.
   Sending to anyone needs the Workers Paid plan.
2. The upgrade adds a `send_email` binding and an `EMAIL_FROM` var to
   `wrangler.jsonc`. Keep both if you merge that file by hand. Run
   `npm run gen` afterwards so `worker-configuration.d.ts` knows the binding.
3. If `REQUIRE_EMAIL_VERIFICATION` is `"true"` on your site, set up email
   **before** deploying this. It is now enforced, and without email nobody
   can confirm an address, so nobody gets past `/verify-email`.
4. If you added your own `/forgot-password`, `/reset-password` or
   `/verify-email` route, it now clashes with the template's.

## [0.5.1] - 2026-11-25

### Security: passkey sign-in

- **A passkey could sign in to an account that was not its own.** Sign-in
  looked the passkey up by its id alone, so anyone with a passkey on the
  site, on their own account, could ask to sign in as any email address,
  sign with their own passkey, and be let in as that person. The passkey
  must now belong to the account. Every site with `passkey` in
  `AUTH_METHODS` should upgrade now.
- Passkey sign-in also refuses deactivated and locked accounts, as password
  sign-in does, and records the sign-in time.
- It no longer tells a stranger whether an email has an account or a
  passkey: one message for all of them.

### Fixed: signing up

- **Passkey sign-up failed with "[object Object]".** With only one role on
  offer there is no role picker, so the form sent `role: null`, which the
  server refused. A missing role now means the default, on every method.
  Passkey sign-up also opened its session with the wrong argument, and
  opened two; it now opens one, as the others do.
- **Every refused request explains itself in a sentence.** Validation
  errors were sent as an object, and the page printed "[object Object]".
  `worker/lib/validator.ts` wraps `zValidator` to answer
  `{ error: "<sentence>" }`, and the browser's `getErrorMessage` copes with
  an object anyway.
- **The name is asked the same way on every sign-up form.** Passkey asked
  for it (and then threw it away); password and PIN did not ask. Now each
  form has the same optional "Your name", and it is saved. A passkey shows
  it in the phone's or password manager's passkey list.
- Passkey sign-up and sign-in now lowercase the email, like every other
  path, so one mailbox cannot become two accounts.
- A sign-up can set only its own details: `registerUserSchema` lists them,
  rather than accepting every column of `users`.
- Clearer words when a passkey prompt is cancelled, or the device already
  has one.

**By hand:** nothing, unless you copied `zValidator` from
`@hono/zod-validator` into routes of your own: import it from
`@server/lib/validator` to get the same plain errors.

## [0.5.0] - 2026-11-25

### Cookie consent

A banner along the bottom of the page (it covers nothing and blocks nothing)
offers **Cookie preferences**, **Reject all** and **Accept all cookies**.
Preferences opens a dialog with each category — strictly necessary (always
on), functional, performance, targeting — a switch for each, and the cookies
in it. The choice is saved for six months in `cookie_consent`; "Cookie
preferences" at the foot of every page changes it, and `/cookies` lists
everything (and works without JavaScript).

- `worker/config/cookies.config.ts` lists every cookie and its category.
- `worker/lib/consent.ts`: `allows(c, category)` on the server;
  `window.cookieConsent.allows(category)` and a `cookie-consent` event in the
  browser.
- `COOKIE_CATEGORIES` (new var) names the optional categories the site uses.
  Unset: all three. Empty: only necessary cookies, and no banner.
- The theme toggle now remembers the theme only while functional cookies
  are allowed.

### First-party analytics (performance cookies)

With performance cookies allowed, every page view and form send is recorded
in the site's own D1, and `/admin/analytics` (admins, in the nav) reports it:
page views, visitors, visits, signed-in visitors, time on each page, load
speed, slowest pages, where visitors came from, devices, browsers,
countries, the pages seen before each form, and each signed-in visitor's
journey.

- New table `analytics_event` (migration `0004_analytics.sql`); cookies
  `_fa_vid` (a year) and `_fa_sid` (30 minutes), listed under performance.
- Never stored: IP address, full user-agent, query strings, form contents.
  Bots and `/admin` pages are skipped. Consent is checked on the server for
  every beacon; withdrawing it deletes both cookies.
- A signed-in visitor's views carry their user id (dropped, not deleted,
  when the account is deleted).
- `ANALYTICS_RETENTION_DAYS` (optional var, default 395) prunes old rows.

**By hand:**

- Run `npm run gen` to make your own migration for `analytics_event`.
- Add `COOKIE_CATEGORIES` to your `wrangler.jsonc` vars with only the
  categories you use (`""` if you set no optional cookies), list any cookies
  of your own in `cookies.config.ts`, and gate their scripts with `allows`.
- Add Analytics to your admin nav if you replaced `NavBar.tsx`.
- If you have a privacy notice, link it from `/cookies`, and say there that
  signed-in visitors' page views are linked to their account.

## [0.4.0] - 2026-11-25

### Pages open on their content

The template's home page was a hero: a badge, a big heading, a tagline, two
buttons and an illustration, all in front of the content. Sites built from
it copied that shape onto every main page. Now the first thing under the nav
is the content itself.

- The brief asks for **the one thing**: the single most important content on
  the site, what a visitor came for (`docs/brief-prompt.md`,
  `docs/brief-template.md`). The new-site steps ask for it before building
  and open the home page on it.
- The frugal skill gains "Pages open on their content": no hero heading,
  blurb and call-to-action button before the content; a page's title names
  it in a few words; the nav carries the wayfinding.
- `worker/views/pages/Home.tsx` is a one-line title and the feature panel.
  The badge, tagline, sign-in buttons (the nav has them) and orbit
  illustration are gone.

**By hand:** nothing is required. If your home page or other main pages
open on a hero, consider replacing it with the content it points to.

## [0.3.0] - 2026-11-15

### Faster sign-in check

Every signed-in request used to wait on four D1 round trips before the page
did any work: the session, then the user, then roles and permissions. The
user id is in the verified token, so all four now go in one `db.batch`, and
the last-seen/renewal write runs after the response via `waitUntil`. With
D1 a region away, that is three fewer network hops on every signed-in page.

- `RoleService` gains `activeRolesQuery`, `directPermissionsQuery` and
  `resolve`, so a caller can batch the role reads with its own.
  `getRolesAndPermissions` is unchanged.

### Access gate on some paths only

- `ACCESS_GATE_PATHS` (comma separated, e.g. `"/reports,/beta"`) limits the
  gate to those sections; the rest of the site stays public, keeps its nav
  and footer, and stays in robots.txt and the sitemap. Empty means the whole
  site, as before. An opened link now lands on the first guarded path.
- The middleware leaves the link that let a visitor in on
  `c.var.accessLink`, so a route can tell whose invitation it was.

### Documented

- Never batch a join on D1: drizzle reads batch rows by column name, so
  tables that share a name (`id`, `created_at`) come back misaligned with no
  error. Never bind an unbounded id list: D1 refuses more than 100
  parameters. Both in the skill's backend reference and its traps list.
- `tests/utils/fakeDb.ts`'s `batch` returns each query's rows instead of an
  empty list.

Upgrading: add `"ACCESS_GATE_PATHS": ""` to `wrangler.jsonc` if you use the
gate. No migration.

## [0.2.1] - 2026-11-15

### Fixed

- CI's placeholder check failed on every push since the template began
  running as a demo: it demanded the `change-me` D1 and KV ids that the demo's
  own ids had replaced on purpose. It now accepts exactly the demo's ids and
  still fails on any other real one. Because CI never passed, `v0.2.0` was
  never tagged; `v0.2.1` is the first tagged versioned release.
- `npm run template -- upgrade` now lists the template migrations in the
  range. `npm run gen` writes only structure, so a hand-added data step (such
  as the email-lowercasing backfill in `0002`) has to be copied into the site's own
  migration.
- The session-limit test opened sessions in the same millisecond and so
  occasionally evicted the wrong one. Test-only; real sign-ins never collide.

Nothing to do by hand.

## [0.2.0] - 2026-11-15

### Template versions

- `frugal.json` records the template release a repo is built from. A site made
  from the template inherits it, so it knows which version it started on.
- `npm run template` lists the releases a site has not applied, with their
  changelog. `npm run template -- upgrade [version]` replays the template's
  changes between the two releases as a three-way merge, then sets the new
  version. `drizzle/` is skipped (run `npm run gen` for schema changes), as
  are files the site deleted.
- Sites made before versioning have no `frugal.json`. Work out by hand which
  release they match (`npm run template -- guess` helps), then
  `npm run template -- pin <version>`.
- CI (template repo only) requires a version bump and a changelog section on
  every pull request. A merge to `main` tags `v<version>` and publishes a
  GitHub release from that section.

### Access gate

Lock a site to invited visitors while it is not public yet. Ported from a
production site and generalised.

- `ACCESS_GATE` in `wrangler.jsonc`: `"off"` (default), `"session"` or
  `"link"`. `"true"` is read as `"session"`.
  - `"session"`: a link works once. Opening it mints a session token for that
    browser's `site_access` cookie, so a forwarded copy is refused.
  - `"link"`: the link is the credential. It keeps working, in any browser,
    until it expires or is revoked.
- Admins create, copy and revoke links at `/admin/access`. A link's clock
  starts on first open, not on creation. Opening takes a POST from a Continue
  button, so chat link previews cannot spend or start a link.
- Everyone else is sent to `/gone`. Sign-in, `/api`, the bundle, fonts and
  favicon stay reachable; a signed-in admin sees everything. While locked,
  `robots.txt` disallows all, `sitemap.xml` is a 404, and pages a locked-out
  visitor can reach render bare, with no nav, footer, tagline or share image.
- Files in `public/` are not gated unless `run_worker_first` is uncommented in
  `wrangler.jsonc`.
- Schema: new `access_link` table. `timestampColumns` added to
  `worker/schema/common.ts` for rows that belong to the site, not a user.
- Upgrading: run `npm run gen` for the table, and add the `site_access` cookie
  to your privacy notice if you turn the gate on.

## [0.1.0]

The first release: everything before versioning began. Tagged `v0.1.0` at
commit `0896328`.

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
- A retro-futurist theme: lunar-grey and deep-navy palettes with an Apollo
  orange primary, self-hosted Michroma and IBM Plex Sans, hard offset shadows,
  a tri-colour stripe band framing the page chrome, an orbit brand mark and a
  home hero built around it. All of it is token-driven in `worker/index.css`.
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

### SEO

- Per-page metadata via `worker/lib/seo.ts`: a route sets `description`,
  `image`, `type` or `noindex` on `c.render` and inherits the rest. Previously
  every page carried the site tagline as its description, which search engines
  read as duplicate content.
- Canonical URLs built from `ORIGIN` and the path, so a site reachable on both
  a custom domain and `workers.dev` points at one address — and so filters and
  tracking params (`?q=…`, `?utm_source=…`) resolve to the page they vary,
  rather than each combination ranking as its own thin page.
- Open Graph and Twitter card tags, so a shared link renders a preview.
- `<html lang>` now comes from `APP_LOCALE` instead of being hardcoded `en`.
- `/robots.txt` and `/sitemap.xml`. robots disallows everything when
  `ENVIRONMENT` is not `production`, so a staging copy cannot be indexed
  alongside the real site.
- `/login`, `/register`, `/admin`, `/api` and `/dev` are `noindex`.
- One URL per page: `canonical-url.middleware.ts` 301s HTTP → HTTPS on the
  production host (with HSTS) and `/path/` → `/path`. Before, Cloudflare served
  every page over plain HTTP too, and a trailing slash was a 404. The scheme is
  read from `CF-Visitor`, because `wrangler dev` presents the production host
  over HTTP and trusting the URL looped a local preview.
- A real 404 page (`views/pages/NotFound.tsx`, status 404, `noindex`) for
  missed page requests, instead of the asset layer's empty body.
- JSON-LD: `jsonLd` on `c.render`, serialised safely by `jsonLdScript`, with
  `websiteSchema` and `faqSchema` in `lib/structured-data.ts`. The home page
  emits `WebSite`.
- A default share image: `APP_OG_IMAGE`, plus `scripts/og-image.mjs`, which
  renders one from the site's own name, tagline, colours and logo. Empty by
  default, so no site ships the template's. `og:image:alt`, `twitter:title` and
  `twitter:description` are added.
- The home page's title is `"{APP_TAGLINE} · {APP_NAME}"` rather than the bare
  site name.
- The frugal skill gains `references/seo.md`: what's built in and how to extend
  it, the per-page checklist, titles and descriptions, headings, canonicals and
  the sitemap, the traps above, how to audit a site, and the owner actions code
  can't do. `SKILL.md` has a "Search and sharing" section, and `new-site.md`
  includes the SEO steps.

### Performance

- Staff-only components (sign-in, registration, profile, and with them the
  WebAuthn client and QR-code library) load only on pages that render them,
  through `ISLANDS` in `components/main.ts`. Public-page JavaScript: 178 KB →
  106 KB minified, 52 KB → 34 KB gzipped.
- `public/_headers` caches `main.css` and the hashed chunks for a year. The
  stylesheet URL carries the deployment ID from the new `CF_VERSION_METADATA`
  binding: a Vite `define` can't do this, because `wrangler deploy` bundles
  `worker/` itself. `client.js` keeps one URL, since the chunks import it by
  that URL.
- The auth path ran **four sequential D1 queries on every authenticated
  request** — the user row, then `user_roles`, then `user_roles` again inside
  the permission lookup, then `user_permissions`. `getRolesAndPermissions()`
  now derives both halves from one concurrent query pair, removing the
  duplicate and two of the four round trips. Locally that is ~25% off the
  database-attributable time per page; on remote D1, where each query is a
  network hop, the saving is proportionally larger.
- The theme named Montserrat, Domine and Source Code Pro but never loaded
  them, so every page silently fell back to system fonts. The tokens are now
  honest system stacks — no download, no layout shift, text on the first
  frame — with a note on how to self-host a real typeface without adding a
  font CDN.

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
