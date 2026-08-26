# Frontend: server views and client islands

Two kinds of "frontend" live in this repo and they run in different places.
Confusing them is the most common source of frontend bugs here.

## Contents

- [The two halves](#the-two-halves)
- [Server views](#server-views)
- [HTMX](#htmx)
- [Client islands](#client-islands)
- [The layout shell](#the-layout-shell)
- [Formatting](#formatting)
- [The build](#the-build)

## The two halves

|          | `worker/views/`                            | `worker/components/`         |
| -------- | ------------------------------------------ | ---------------------------- |
| Runs     | In the Worker, per request                 | In the browser               |
| Is       | Hono JSX → an HTML string                  | Lit custom elements          |
| Can      | Read props                                 | Hold state, use browser APIs |
| Cannot   | Hold state, use `window`/`document`, fetch | Read the database            |
| Built by | `vite build` (server bundle)               | `vite build --mode client`   |

**Default to `views/`.** Reach for a client component only when the server
genuinely cannot do the job — a WebAuthn ceremony, `localStorage`, a modal's
open/closed state. Everything else is a server render plus an HTMX swap, and
keeping it that way is what makes this stack fast and debuggable.

`views/` JSX is not React. There is no `useState`, no `useEffect`, no event
handler props. A view is a pure function of props that returns markup.

## Server views

One folder per feature, e.g. `worker/views/notes/NoteComponents.tsx`, exporting
several sizes of component: a full page, the table or list, and a single row.
The row is exported separately so a route can re-render just that row.

```tsx
export const ThingRow = ({ thing, locale }: { thing: SelectThing; locale: string }) => (
  <tr class="border-b transition-colors hover:bg-muted/40" id={`thing-${thing.id}`}>
    …
  </tr>
);
```

Rules that keep this workable:

- **No data access.** The route fetches and passes props. A view that queries
  the database cannot be reused as a fragment.
- **Stable `id` on anything HTMX targets** — `id={`thing-${thing.id}`}` — so a
  response can address it.
- **`class`, not `className`.** Hono JSX uses the HTML attribute name.
- **Pass `locale`/`currency` down** from `c.var.app` for formatting rather than
  hardcoding.
- Keep fragments small enough to return on their own.

Pages live in `worker/views/pages/`, shared atoms in
`worker/views/components/`, helpers in `worker/views/lib/utils.ts`.

Some components use `html` from `hono/html` (tagged template literals) instead
of JSX — `NavBar.tsx` does, because it embeds a `<script>`. Both produce the
same output; follow whichever the file already uses. In `html` templates,
interpolated values are escaped, and arrays of templates render in order.

## HTMX

HTMX turns ordinary attributes into AJAX. The server keeps returning HTML.

| Attribute                          | Does                                                          |
| ---------------------------------- | ------------------------------------------------------------- |
| `hx-get` / `hx-post` / `hx-delete` | Issue the request                                             |
| `hx-target="#thing-3"`             | Where the response goes (default: the element)                |
| `hx-swap="outerHTML"`              | How — `innerHTML`, `outerHTML`, `none`, `beforeend`           |
| `hx-confirm="Delete this?"`        | Native confirm before firing                                  |
| `hx-vals='{"id": "3"}'`            | Extra values to send                                          |
| `hx-boost="true"`                  | Turns ordinary links into swaps (set on `<main>`)             |
| `hx-swap-oob="outerHTML"`          | On an element _in the response_, updates it wherever it lives |

A delete that removes its own row:

```tsx
<button
  hx-delete={`/things/${thing.id}`}
  hx-target={`#thing-${thing.id}`}
  hx-swap="outerHTML swap:200ms"
  hx-confirm="Delete this thing?">
```

The route returns an empty body and the row is replaced with nothing.

A form that replaces the page:

```tsx
<form hx-post="/things" hx-target="body" hx-swap="outerHTML">
```

**Telling a search swap from a boosted navigation.** `hx-boost` on `<main>`
means an ordinary link click is *also* an HTMX request, so `HX-Request` alone
cannot distinguish "the user typed in the search box" from "the user clicked
Notes in the nav". Both would get the bare fragment, and the boosted
navigation would render a page with no layout. Branch on the target instead —
the search control names it, boosted navigation does not:

```tsx
const isGridSwap = c.req.header("HX-Target") === "note-grid";
if (isGridSwap) return c.html(<NoteGrid {...props} />);
return c.render(<NoteListPage {...props} />, { title: "Notes" });
```

**Put HTMX attributes on the control, not the form.** A trigger on the form
needs `from:` selectors to know which child fired, which is fragile and fails
silently. Give each control its own `hx-get` and `hx-trigger` plus
`hx-include="closest form"`, so every control still submits the whole form and
their states cannot diverge. Leave the `<form action method>` intact and the
page keeps working with JavaScript off.

**Everything the browser runs is in one bundle.** HTMX, Lucide and the app's
own components are all imported by `worker/components/main.ts` and built into
`/static/client.js`. Nothing is fetched from a third-party CDN at runtime, so
the page needs no external request, works offline, and needs no `script-src`
exception. Add a library as a dependency and import it there — do not add a
`<script src="https://…">` to `Layout.tsx`.

**Icons are registered, not global.** `worker/components/lib/icons.ts` imports
the ~30 icons in use so the bundler can drop the other ~1600. Using
`data-lucide="something"` that is not registered renders nothing;
`tests/icons.test.ts` catches every name written as a literal and tells you
the import to add, and `renderIcons()` warns in the console for names built at
runtime. `window.renderIcons()` is exposed for the server-rendered inline
scripts, which cannot import from the bundle.

It already wires the global behaviour: Lucide icons are re-rendered after
every swap, `409` responses are allowed to swap (so a
conflict can render a form with errors), a generic error toast fires on
unhandled failures, open `<details>` close on outside click, and the page
scrolls to top after a `#main-content` swap. Extend that file rather than
adding page-level scripts.

## Client islands

A Lit element is justified when state cannot live on the server. Existing ones:
`<theme-provider>` and the theme toggle (`localStorage`), `<app-toaster>`
(transient queue), `<auth-login>` / `<auth-register>` / `<totp-setup-button>` /
`<totp-verify-modal>` (WebAuthn and multi-step flows), `<nav-user-menu>`,
`<profile-islands>`.

```ts
import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("thing-picker")
export class ThingPicker extends LitElement {
  @property({ type: String, attribute: "selected-id" }) selectedId = "";
  @state() private open = false;

  // Light DOM, so Tailwind classes apply. Shadow DOM would scope them out.
  protected createRenderRoot() {
    return this;
  }

  render() {
    return html`<div class="rounded-lg border bg-card p-4">…</div>`;
  }
}
```

Two things to get right:

- **`createRenderRoot() { return this; }`** — renders into the light DOM.
  Without it, Shadow DOM isolates the element from Tailwind and every class is
  inert.
- **Register it in `worker/components/main.ts`** with a bare
  `import "./ui/ThingPicker";`, or the custom element is never defined and the
  tag renders as nothing. For heavier, page-specific elements, use the lazy
  `import()` pattern at the bottom of that file.

Attributes are strings; declare `{ type: Number }` or `{ type: Boolean }` to
coerce, and use `attribute: "selected-id"` for hyphenated names.

Talking to the API: `worker/components/lib/utils.ts` exports `api`, a Hono RPC
client built from the `AppType` exported by `app.tsx`, so client calls are
typed against the real routes. It also exports `toast`, `redirectWithToast`,
`getFlashToast` and `getErrorMessage`. Use `getErrorMessage(res)` rather than
reading `res.json()` inline — it handles non-JSON error bodies.

## The layout shell

`worker/views/Layout.tsx` wraps every SSR response, via
`renderer.middleware.tsx`. It renders `<theme-provider>`, the `NavBar`,
`<main hx-boost="true" id="main-content">`, `<div id="modal-container">`,
`<app-toaster>` and the footer, and links the stylesheet and client bundle.

Anything the shell needs on every page — the signed-in user, branding, a global
count — is gathered once in `renderer.middleware.tsx` rather than threaded
through each route.

Nav links come from `menuConfig` in `worker/views/components/NavBar.tsx`, keyed
by role. A user sees the union of their roles' lists, de-duplicated by href.
**A new page with no `menuConfig` entry is unreachable by clicking**, which
usually reads as "the feature didn't work".

Page titles: `c.render(view, { title: "Things" })` or the `title` argument to
`htmxResponse` — the layout appends the app name.

## Formatting

`worker/views/lib/utils.ts`:

- `formatCents(cents, locale, currency)` — money is stored as integer cents;
  `dollarsToCents(value)` converts back at the edge. Never do float arithmetic
  on money.
- `formatDateShort(date, locale)`, `formatDateCompact(date, locale)`
- `capitalize(str)`
- `StatusBadge(status, styles, iconName?)` — pass a status→classes map using
  theme tokens, with a `default` key for unknown statuses.

Pass `locale` and `currency` from `c.var.app` so a site configured for another
region formats correctly.

## The build

Two Vite passes from one config:

- `vite build --mode client` → `dist/client/static/client.js` + `main.css`,
  with `public/` copied alongside. Served by the `ASSETS` binding.
- `vite build` → the worker bundle from `worker/index.ts`.

In dev, the stylesheet and client entry are loaded from source; in production
from `/static/`. `Layout.tsx` switches on `import.meta.env.PROD` — which is why
a new client file must be reachable from `main.ts` to be bundled at all.
