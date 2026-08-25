---
name: frugal
description: Build and style features in the Frugal Cloudflare Workers template (Hono + server-rendered JSX + HTMX + D1/Drizzle, Tailwind theme tokens). Use this skill whenever you are adding or changing anything in this repo — a page, route, form, database table, migration, nav link, auth or permission rule — and for every visual or CSS change, however small. Trigger it on requests like "add a feature", "make a page for X", "add a table", "build a form", "change the colours", "restyle this", "make it look better", "add a dashboard", or any mention of worker/, HTMX, Drizzle, D1, wrangler.jsonc, themes, or dark mode. It covers the frontend/backend split, the registration steps a new feature needs in order to actually appear, and the theme-token styling rules that keep light and dark mode working — all of which are easy to miss and tedious to debug afterwards.
---

# Building on the Frugal template

A single Cloudflare Worker that server-renders every page. Hono routes it, JSX
renders it, HTMX swaps fragments, D1 + Drizzle store it, and Tailwind theme
tokens style it. There is no separate frontend app to deploy and no client
router — the server is the application.

Read `architecture.md` in the repo root for the request lifecycle. This skill
is about _how to add to it_ without breaking the parts that are already right.

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
| `worker/lib/`        | crypto, `htmx-helpers`, formatting                             |

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
  survives.
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

To see it running: `npm run migrate:local` once, then `npm run dev` on
:3000 (`.dev.vars` needs `JWT_SECRET`; set `RP_ID=localhost` and
`ORIGIN=http://localhost:3000` there for passkeys).

## Shipping

Cloudflare's Git integration builds and deploys on every push — there is no
deploy command anyone runs. Push, then watch **Settings → Builds**.

Schema changes deploy themselves: `npm run deploy` (the dashboard's Deploy
command) applies migrations immediately before the new code goes live. D1
migrations are forward-only, so a destructive change needs a forward fix
rather than a rollback. `docs/deploy.md` covers setup, failures and rollback.

## Reference files

- `references/styling.md` — the theme system in depth: every token and its
  role, adding a theme, component patterns, dark-mode pitfalls.
- `references/backend.md` — schema, validation, services, auth, RBAC, HTMX
  response patterns, testing.
- `references/frontend.md` — server views vs client islands, HTMX attributes,
  when a Lit component is justified and how to write one.
