---
name: frugal
description: Build, configure and style apps on the Frugal Cloudflare Workers template (Hono + server-rendered JSX + HTMX + D1/Drizzle, Tailwind theme tokens). Use this skill for BOTH jobs it covers. First, turning a fresh copy of the template into a real site — trigger on "I want to build X with this", "set up this repo", "new site from this template", a pasted app brief, or any mention of wiring D1, KV or R2. Second, all ongoing work — adding a page, route, form, table, migration, nav link, auth or permission rule, and every visual or CSS change however small ("restyle this", "change the colours", "make it look better", "add a dashboard", dark mode). It covers the exact template-to-app procedure, how to wire each binding, the frontend/backend split, the registration steps a feature needs in order to be reachable, and the theme-token rules that keep light and dark working — all easy to miss and tedious to debug afterwards.
---

# Building on the Frugal template

A single Cloudflare Worker that server-renders every page. Hono routes it, JSX
renders it, HTMX swaps fragments, D1 + Drizzle store it, and Tailwind theme
tokens style it. There is no separate frontend app to deploy and no client
router — the server is the application.

Read `architecture.md` in the repo root for the request lifecycle. This skill
is about _how to add to it_ without breaking the parts that are already right.

## First: is this still the template?

Check before doing anything else, because the answer changes what you do:

```bash
grep -in "change.me\|0000000\|frug-app" wrangler.jsonc | grep -v ":\s*//"
```

**Any hit outside a comment** means this repo has never been configured. Do not
start writing features — read `references/new-site.md` and follow it from the
top. It covers getting a brief, choosing which of D1/KV/R2 the app needs,
configuring the repo, modelling the domain in one migration, and stripping the
example feature. Skipping it produces an app that builds locally and cannot
deploy, because its bindings point at placeholders.

**No hits** means this is a real site. Carry on with the rest of this file.

One thing that holds in both cases: **never configure the template repository
itself.** Real ids belong in the repo made *from* the template. A configured
template hands the next site someone else's database, and its first deploy
migrates live data. If you find real ids in a repo that is meant to be the
template, say so rather than building on it.

## Four things that matter most

These are the mistakes that cost the most time, in order:

1. **Style with theme tokens, never raw colours.** `bg-card`, not
   `bg-white`. A raw colour looks fine in whichever mode you happened to
   test and is unreadable in the other. See "Styling" below — this is
   non-negotiable in a way the other rules are not, because it silently
   produces broken output rather than an error.
2. **A new feature has to be registered in several places** or it renders
   but is unreachable. See the checklist below.
3. **Scope every query by owner** in the `where` clause, not in a check
   afterwards. An unauthorised row should never be loaded.
4. **Run `npm run build` before you finish.** It generates types, typechecks
   and bundles. It catches the class of error — a view importing something a
   route no longer passes — that this architecture makes easy to create.

Then read the next section, because the build catches none of it.

## Traps that produce no error

Everything here typechecks, lints clean, renders without throwing, and is
wrong. Each one shipped at least once. Most now have a test — but those tests
only cover the template's own pages, so the habit is what protects your code.

**An interpolated Tailwind class name does not exist.** Tailwind builds CSS by
scanning source for _complete_ class names, so `grid-cols-${n}` is never
generated and the rule silently does nothing. Worse, in a plain JSX attribute
(`class="grid-cols-${n}"` — double quotes, no braces) there is no interpolation
at all, and the literal text `${n}` goes into the markup. Write whole class
names and map a value onto them:

```tsx
const gridColsFor = (n: number) => (n >= 3 ? "grid-cols-3" : "grid-cols-2");
```

Caught by "renders no unevaluated template interpolation" in
`tests/ui-pages.test.ts`. Note what let the original survive: the broken
element only rendered with more than one auth method enabled, and the tests
configured one. **A branch no test configures is untested** — vary the config,
not just the route.

**A pale palette tint has no dark-mode counterpart.** `bg-emerald-100
text-emerald-800` reads perfectly in light mode and is dark-on-dark the moment
the theme flips. Reach for a semantic token: `success` and `warning` exist
alongside `primary` and `destructive` so status UI never needs the palette.
Caught by `tests/conventions.test.ts`.

**A hover-only control does not exist on a phone.** `opacity-0
group-hover:opacity-100` on the only button that performs an action means a
touch user can never reach it. Fine for decoration, never for the only path to
an action. Interactive targets are `h-11` (44px) — which is why the template
has no `h-9` buttons left. Also caught by `tests/conventions.test.ts`.

**A missing secret fails on the success path only.** `setSignedCookie` throws
on an undefined secret, and only a successful sign-in sets a cookie — so a
_wrong_ password gave a clean error page and the _right_ one an opaque 500. It
reads as "valid credentials are being rejected" and sends you into the hashing
code, nowhere near the cause. `requireSecrets` now refuses to serve anything
without `JWT_SECRET`, with a page naming the fix. Never reintroduce a fallback
like `env.JWT_SECRET || "default"`: signing sessions with a literal that ships
in public source lets anyone mint one, and nothing looks wrong. Caught by
`tests/secrets.test.ts`.

**`JWT_SECRET` must be a Secret, not a _Build_ variable.** A Build variable
exists only while the build runs and is `undefined` at runtime, while looking
perfectly set in the dashboard. Secrets apply immediately — no redeploy.

**A delete that changed nothing still reports success.** Drizzle's `update`
resolves happily when the `where` matched no rows, so a route that ignores the
result returns 200, HTMX swaps the card away, and the row is back on refresh.
Use `.returning()` and act on an empty result:

```ts
const changed = await db.update(note).set({ deletedAt: now })
  .where(and(eq(note.id, id), isNull(note.deletedAt)))
  .returning({ id: note.id });
if (changed.length === 0) { /* say so; do not swap it away */ }
```

**`tests/utils/fakeDb.ts` ignores `where` clauses.** It is a shape stub for
render tests and nothing more. A passing test against it says nothing about
ownership scoping or filtering, so never verify an isolation rule with it —
those need real D1 (`npm run migrate:local`, then query it).

**A summary seeded from the child table hides its empty members.** Building a
per-owner view from child rows drops every owner that has none, so a freshly
added one reads as "nothing here yet". Seed from the canonical table and left
join the children.

**Content sits under the fixed header** unless `<main>` carries the offset
(`pt-14`). A page that wants no nav sets `bare` on its meta rather than
fighting the padding.

One habit covers most of these: **open the page in a real browser before
calling it done** — both modes, and at 390px wide. Playwright is available.
The tests render HTML; they never look at it.

## The split

**Backend — runs in the Worker:**

| Path                 | Holds                                                          |
| -------------------- | -------------------------------------------------------------- |
| `worker/index.ts`    | Entry: CORS, global middleware, error handling                 |
| `worker/app.tsx`     | The router. Feature routers are mounted here                   |
| `worker/routes/`     | Route handlers, grouped `web/` `api/` `admin/` + feature files |
| `worker/services/`   | Business logic worth testing on its own                        |
| `worker/schema/`     | Drizzle tables + the Zod validators derived from them          |
| `worker/middleware/` | config, db, auth, guards, the SSR renderer                     |
| `worker/config/`     | `app.config.ts` (branding), `auth.config.ts` (auth + RBAC)     |
| `worker/lib/`        | crypto, `htmx-helpers`, `dates`, formatting, `seo`             |

**Frontend — two different things, don't confuse them:**

| Path                 | Runs                                      | Use for                                                                                                    |
| -------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `worker/views/`      | **On the server.** Hono JSX → HTML string | Every page and fragment. No `useState`, no browser APIs, no data fetching — pure functions of props        |
| `worker/components/` | **In the browser.** Lit custom elements   | Only what the server genuinely cannot do: WebAuthn ceremonies, theme persistence, modal open/close, toasts |

Default to `views/`. Reach for `components/` only when you catch yourself
needing browser state — this is a server-rendered app and keeping it that way
is what makes it fast and simple.

Aliases: `@server/*` → `worker/*`, `@views/*` → `worker/views/*`,
`@components/*` → `worker/components/*`.

## Styling

The theme is a set of semantic CSS variables defined in `worker/index.css`,
mapped to Tailwind utilities via `@theme inline`. Light lives on `:root`, dark
on `.dark`, and `<theme-provider>` toggles the class before first paint.

**Use the semantic token, not the colour you have in mind.** Every token has a
light and a dark value, so token-styled UI adapts for free. A hardcoded colour
does not, and nothing will warn you.

| Need               | Use                                            | Never                                    |
| ------------------ | ---------------------------------------------- | ---------------------------------------- |
| Page background    | `bg-background`                                | `bg-white`, `bg-gray-50`, `bg-slate-900` |
| Body text          | `text-foreground`                              | `text-black`, `text-gray-900`            |
| Panel / card       | `bg-card text-card-foreground`                 | `bg-white shadow`                        |
| Secondary text     | `text-muted-foreground`                        | `text-gray-500`                          |
| Subtle fill        | `bg-muted`                                     | `bg-gray-100`                            |
| Main action        | `bg-primary text-primary-foreground`           | `bg-blue-600 text-white`                 |
| Hover / highlight  | `hover:bg-accent hover:text-accent-foreground` | `hover:bg-gray-100`                      |
| Delete / error     | `text-destructive`, `hover:bg-destructive/10`  | `text-red-600`                           |
| Borders            | `border-border`, `border-input`                | `border-gray-200`                        |
| Focus ring         | `focus:ring-2 focus:ring-ring`                 | `focus:ring-blue-500`                    |
| Popover / dropdown | `bg-popover text-popover-foreground`           | `bg-white`                               |
| Chart series       | `text-chart-1` … `chart-5`                     | arbitrary hexes                          |

Opacity modifiers on tokens are encouraged — `bg-primary/10`, `bg-accent/50`,
`border-destructive/20` — they stay theme-correct.

`rounded-lg` is the house default; `radius`, fonts and shadows are tokens too
(`shadow-sm`, `font-sans`). Only add a new token if a genuinely new semantic
role appears, and add it to `:root`, `.dark` **and** `@theme inline` together —
a token missing from any one of the three breaks that mode.

To restyle the whole app, change the values in `worker/index.css`. Do not
sprinkle overrides through components. Full detail, including how to add a
third theme: `references/styling.md`.

## Adding a feature

`worker/schema/note.schema.ts`, `worker/routes/notes.tsx` and
`worker/views/notes/` are a complete worked example — schema, validation,
guarded routes, ownership checks, HTMX fragments, soft deletes. **Read those
three files before writing a new feature** and copy their shape; it is faster
and more consistent than inventing one.

1. **Schema** — `worker/schema/<feature>.schema.ts`. Drizzle table, spread
   `ownershipColumns` for `userId` + timestamps, add `deletedAt` for soft
   deletes, derive Zod schemas with `drizzle-zod`, export the inferred types.
2. **Migration** — `npm run gen`. Never hand-edit files in `drizzle/`.
3. **Views** — `worker/views/<feature>/`. Pure functions of props. Give every
   fragment HTMX can target a stable `id`.
4. **Route** — `worker/routes/<feature>.tsx`. Guard, validate, authorise,
   respond.
5. **Register it** — see below.
6. **Verify** — `npm run build && npm run test`.

### Registration checklist

A feature that renders but is invisible is almost always a missed line here:

- [ ] `worker/app.tsx` — mount the router (`.route("/things", thingsRoute)`)
- [ ] `worker/views/components/NavBar.tsx` — add to `menuConfig` under each
      role that should see it, or there is no way to navigate to it
- [ ] `wrangler.jsonc` — add permission strings to `PERMISSIONS_AVAILABLE`
      and grant them in `ROLES_INHERENT`
- [ ] `worker/services/access.service.ts` — add the resource to the
      `Resource` union, or `authorize()` will not typecheck
- [ ] `worker/routes/dev.tsx` — add the table so it shows in the inspector
- [ ] `tests/ui-pages.test.ts` — add the new paths
- [ ] Client-side element? Import it in `worker/components/main.ts` or it
      never registers

### Routes

```tsx
export const thingsRoute = new Hono<AppEnv>();
thingsRoute.use("*", requireUser); // guards the whole router

thingsRoute.get("/", async (c) => {
  const user = c.var.auth.user!;
  access.authorize(user, "things", "read");

  const things = await c.var.db
    .select()
    .from(thing)
    .where(and(eq(thing.userId, user.id), isNull(thing.deletedAt)));

  return htmxResponse(c, "Things", <ThingListPage things={things} />);
});
```

`htmxResponse(c, title, fragment)` returns the bare fragment to an HTMX
request and the full page otherwise, so one handler serves a swap, a refresh
and a shared link.

Two authorisation layers, answering different questions: guards
(`requireUser`, `requireRole`, `requirePermission`) decide whether the user
reaches the router at all; `AccessControl.authorize(user, resource, action,
ownerId?)` decides whether they may touch a specific row.

Feedback: `htmxToast(c, msg)` when the response itself renders,
`flashToast(c, msg)` when you are about to `c.redirect(...)` — it survives the
navigation. Available in `c.var`: `db`, `auth`, `app` (branding/locale),
`authConfig`.

More in `references/backend.md` and the repo's `endpoints.md`.

## Conventions worth keeping

- **Money is integer cents.** Convert at the edges with `dollarsToCents` and
  `formatCents`; never do float arithmetic on money.
- **Soft delete** — set `deletedAt`, filter with `isNull(...)`, so history
  survives. Always `.returning()` and report an empty result rather than a
  silent success (see "Traps" above).
- **Calendar dates are `YYYY-MM-DD` strings**, handled by `worker/lib/dates.ts`
  (`today`, `addDays`, `daysUntil`, `isOverdue`, `relativeDueLabel`). They work
  in UTC on purpose: a due date is a day, not an instant, and doing the
  arithmetic on a local-time `Date` moves it by one either side of midnight.
- **Never return a raw `users` row.** `Auth.toSafeUser()` strips
  `passwordHash`, `pin` and `totpSecret`. Every exit from the auth service
  goes through it.
- **Locale and currency come from `c.var.app`**, not hardcoded — the
  formatters in `worker/views/lib/utils.ts` take them as arguments.
- Match the surrounding code's comment density and naming. Explain _why_ in
  comments, not _what_.

## Verifying

```bash
npm run build     # wrangler types → tsc → client + server bundles
npm run test      # route smoke tests, signed out and signed in
npm run lint
npm run format:write
```

In a web session the SessionStart hook (`.claude/hooks/session-start.sh`) has
already run `npm install` and `wrangler types`, so the build works immediately.
Locally, run those once yourself.

To see it running: `npm run migrate:local` once, then `npm run dev` on
:3000 (`.dev.vars` needs `JWT_SECRET`; set `RP_ID=localhost` and
`ORIGIN=http://localhost:3000` there for passkeys).

**Then actually look at it.** The tests assert that HTML comes back; they never
assert it is legible. Before calling UI work done, open the pages you touched
in light and dark, and at 390px wide. Playwright is installed and Chromium is
already on disk — do not run `playwright install`:

```ts
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
// A sandboxed session proxies HTTPS through its own CA:
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
```

Two cautions from experience. Give a boosted navigation time to finish before
asserting on the next page — otherwise you will diagnose your own race as an
app bug. And a stale `client.js` is served from cache without a content hash in
its filename, so a hard reload is part of reproducing anything.

## Shipping

Cloudflare's Git integration builds and deploys on every push — there is no
deploy command anyone runs. Push, then watch **Settings → Builds**.

Schema changes deploy themselves: `npm run deploy` (the dashboard's Deploy
command) applies migrations immediately before the new code goes live. D1
migrations are forward-only, so a destructive change needs a forward fix
rather than a rollback. `docs/deploy.md` covers setup, failures and rollback.

## Reference files

- `references/new-site.md` — **read this first if the repo is still the
  template.** The ordered procedure from fresh copy to working app.
- `references/bindings.md` — D1, KV and R2: which to use for what, how to wire,
  remove or add each, and how to verify before deploying.
- `references/styling.md` — the theme system in depth: every token and its
  role, adding a theme, component patterns, dark-mode pitfalls.
- `references/backend.md` — schema, validation, services, auth, RBAC, HTMX
  response patterns, testing.
- `references/frontend.md` — server views vs client islands, HTMX attributes,
  when a Lit component is justified and how to write one.
