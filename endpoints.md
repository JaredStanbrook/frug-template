# Development Guide: Routes, HTMX, and the Service Layer

How endpoints are built in this template — the separation between routes,
services and views, and the HTMX patterns that hold it together.

`worker/routes/notes.tsx` is the worked example every snippet below is drawn
from. Read it alongside this document.

---

## 1. Routing architecture

Routes live in `worker/routes/`, grouped by audience:

| Directory               | Purpose                                             | Response type               |
| :---------------------- | :-------------------------------------------------- | :-------------------------- |
| `web/`                  | Public pages (home, login, register)                | Full HTML or HTMX fragments |
| `admin/`                | Routes behind `requireRole("admin")`                | Full HTML or HTMX fragments |
| `api/`                  | JSON endpoints for programmatic and client-side use | JSON                        |
| root (e.g. `notes.tsx`) | Feature routers mounted directly                    | Full HTML or HTMX fragments |

Every route file exports a `new Hono<AppEnv>()` instance, which is what makes
`c.env`, `c.var.db`, `c.var.auth` and `c.var.app` typed inside handlers.

```tsx
export const notesRoute = new Hono<AppEnv>();
```

Mount it in `worker/app.tsx`. Guards applied with `.use("*", ...)` on the
router cover every route in it — prefer that over repeating the check.

---

## 2. HTMX-first development (`lib/htmx-helpers.ts`)

### `htmxResponse`

Returns a bare fragment to HTMX and a full page to a direct visit, so one
handler serves both an AJAX swap and a browser refresh or a shared link:

```tsx
return htmxResponse(c, "Notes", <NoteListPage notes={notes} />);
```

### The rest of the toolkit

- **`htmxToast(c, msg, { type })`** — attaches a toast to _this_ response.
  Picked up by the `<app-toaster>` element.
- **`flashToast(c, msg)`** — writes a short-lived cookie so the message
  survives a redirect. Use this one whenever you `c.redirect(...)`.
- **`htmxRedirect(c, "/login")`** — sets `HX-Redirect` so HTMX changes the
  browser location rather than swapping content.
- **`htmxPushUrl(c, "/notes")`** — updates the URL bar during a swap.
- **`isHtmxRequest(c)`** — when you need to branch explicitly.

### Out-of-band swaps

To update something outside the swap target — a counter in the navbar while
replacing the main content — render that element with
`hx-swap-oob="outerHTML"` and include it in the same response.

---

## 3. The service layer

Routes handle HTTP. Services handle rules. A route validates input, calls a
service, and turns the result into a response:

```tsx
.post("/login", zValidator("json", loginUserSchema), async (c) => {
  const { auth } = c.var;
  const body = c.req.valid("json");

  const result = await auth.loginWithPassword(body.email, body.password);

  await auth.createSession(result.user);
  return c.json(result.user);
})
```

This split buys three things: `Auth.register()` serves an API route and a web
form alike; services are unit-testable without a Hono request; and a route file
stays short enough to read in one screen.

Not every feature needs a service. `notes.tsx` queries Drizzle directly because
the logic is a `where` clause — reach for a service when logic is shared across
routes or complex enough to test on its own.

---

## 4. Validation with Zod

`@hono/zod-validator` validates JSON bodies and form posts at the route
boundary, so handlers receive typed, trusted data:

```tsx
notesRoute.post("/", zValidator("form", noteFormSchema), async (c) => {
  const data = c.req.valid("form"); // typed, already validated
  // ...
});
```

Pass a third argument to render the form back with errors instead of
returning a default 400:

```tsx
zValidator("form", noteFormSchema, (result, c) => {
  if (!result.success) {
    const errors = Object.fromEntries(
      result.error.issues.map((i) => [String(i.path[0]), i.message]),
    );
    return c.html(<NoteFormPage errors={errors} />, 422);
  }
});
```

Form schemas usually differ from insert schemas: a checkbox arrives as
`"on"` or absent, and ownership and timestamps are server-assigned, never
accepted from the client. See `noteFormSchema` in `worker/schema/note.schema.ts`.

---

## 5. Authorization in a handler

Two checks, answering different questions:

```tsx
notesRoute.use("*", requireUser); // may they reach this router?

notesRoute.get("/:id/edit", async (c) => {
  const user = c.var.auth.user!;

  const [existing] = await c.var.db
    .select()
    .from(note)
    .where(and(eq(note.id, id), isNull(note.deletedAt)));

  if (!existing) return c.notFound();
  access.authorize(user, "notes", "update", existing.userId); // may they touch this row?

  return htmxResponse(c, "Edit note", <NoteFormPage note={existing} />);
});
```

For list endpoints, scope in the query itself rather than filtering after the
fact — an unauthorized row should never be loaded:

```tsx
.where(and(eq(note.userId, user.id), isNull(note.deletedAt)))
```

---

## 6. Adding a feature

1. **Schema** — `worker/schema/<feature>.schema.ts`: Drizzle table (spread
   `ownershipColumns`), Zod schemas, inferred types.
2. **Migrate** — `bun run gen`, then `bun run migrate:local`.
3. **Views** — `worker/views/<feature>/`: pure functions of props, stable `id`
   on every swappable fragment.
4. **Service** — only if the logic warrants it.
5. **Route** — `worker/routes/<feature>.tsx`, guarded and validated.
6. **Mount** — add to `worker/app.tsx`, add a link to `menuConfig` in
   `NavBar.tsx`, add the table to `routes/dev.tsx`.
7. **Permissions** — add strings to `PERMISSIONS_AVAILABLE` in
   `wrangler.jsonc` and the resource to `Resource` in `access.service.ts`.
8. **Test** — add the paths to `tests/ui-pages.test.ts`.

---

## Summary

| Concern        | Tool                                                  |
| :------------- | :---------------------------------------------------- |
| Validation     | Zod + `zValidator`                                    |
| Persistence    | Drizzle ORM + Cloudflare D1                           |
| Authentication | `AuthService` + `authMiddleware`                      |
| Authorization  | `requireRole` / `requirePermission` + `AccessControl` |
| Page updates   | HTMX swaps via `htmxResponse`                         |
| Notifications  | `htmxToast` / `flashToast`                            |
| Redirection    | `htmxRedirect` or `c.redirect`                        |

Lean on the client, robust on the server.
