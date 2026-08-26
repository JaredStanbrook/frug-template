# Styling: the theme system

Everything visual comes from semantic tokens in `worker/index.css`. This file
explains what each token means, how the light/dark mechanism works, and how to
extend it without breaking a mode.

## Contents

- [How it fits together](#how-it-fits-together)
- [The tokens](#the-tokens)
- [Choosing a token](#choosing-a-token)
- [Non-colour tokens](#non-colour-tokens)
- [Restyling the app](#restyling-the-app)
- [Adding a token](#adding-a-token)
- [Adding a theme](#adding-a-theme)
- [Component patterns](#component-patterns)
- [Pitfalls](#pitfalls)

## How it fits together

Three layers in `worker/index.css`:

```css
:root { --primary: oklch(0.55 0.16 250); ... }   /* light values  */
.dark { --primary: oklch(0.70 0.14 250); ... }   /* dark values   */

@theme inline {
  --color-primary: var(--primary);               /* → bg-primary, text-primary */
}
```

`@theme inline` is what turns a variable into a Tailwind utility. A token
defined in `:root` and `.dark` but missing from `@theme inline` generates no
class; one in `@theme inline` but missing from `.dark` keeps its light value in
dark mode. Both failures are silent, which is why the three blocks must be
edited together.

`<theme-provider>` (in `worker/components/ui/ThemeProvider.ts`, rendered at the
top of `Layout.tsx`) reads `localStorage["vite-ui-theme"]` and applies `.dark`
to `<html>` before first paint, so there is no flash. The toggle in
`NavBar.tsx` cycles light → dark → system.

Colours are `oklch()` — perceptually uniform, so a lightness change reads as
the same visual step across hues. Keep new values in `oklch` for consistency.

## The tokens

Each is a pair: a surface and the foreground meant to sit on it. Using a
matched pair guarantees contrast in both modes.

| Token pair                               | Meaning                                             |
| ---------------------------------------- | --------------------------------------------------- |
| `background` / `foreground`              | The page itself and its default text                |
| `card` / `card-foreground`               | Raised surfaces: panels, list containers, tiles     |
| `popover` / `popover-foreground`         | Floating surfaces: dropdowns, menus, tooltips       |
| `primary` / `primary-foreground`         | The main action. One per view, ideally              |
| `secondary` / `secondary-foreground`     | A less prominent action                             |
| `muted` / `muted-foreground`             | Subtle fills, and de-emphasised or helper text      |
| `accent` / `accent-foreground`           | Hover and active states on interactive rows         |
| `destructive` / `destructive-foreground` | Delete, error, irreversible actions                 |
| `sidebar*`                               | A parallel set for sidebar chrome, if you build one |

Standalone tokens: `border` (dividers, outlines), `input` (form control
borders), `ring` (focus rings), `chart-1` … `chart-5` (categorical series).

## Choosing a token

Ask what the element _is_, not what colour it should be:

- Sits directly on the page → `bg-background`
- A raised panel holding content → `bg-card`
- Floats above everything → `bg-popover`
- A quiet fill inside a card → `bg-muted`
- Only appears on hover → `hover:bg-accent`

For text, the default is `text-foreground`; drop to `text-muted-foreground` for
anything secondary. On a coloured surface, always use its paired foreground —
`bg-primary text-primary-foreground`, never `bg-primary text-white`, because
in a light theme the primary may itself be light.

Opacity modifiers stay theme-correct and are the idiomatic way to get a tint:

```html
<div class="bg-primary/10 text-primary border border-primary/20">…</div>
```

## Non-colour tokens

- **Radius** — `--radius: 0.5rem` drives `rounded-sm` (4px), `rounded-md`
  (6px), `rounded-lg` (8px), `rounded-xl` (12px). `rounded-lg` is the house
  default for cards, buttons and inputs; `rounded-xl`/`rounded-2xl` for large
  panels; `rounded-full` for avatars and pills. Change `--radius` alone to make
  the whole app rounder or sharper.
- **Fonts** — `font-sans` (Montserrat), `font-serif` (Domine), `font-mono`
  (Source Code Pro), from `--font-*`.
- **Shadows** — `shadow-2xs` … `shadow-2xl`. Cards use `shadow-sm`; floating
  surfaces `shadow-md`. Prefer a border over a heavy shadow: shadows are nearly
  invisible in dark mode, so a card that relies on one alone loses its edge.
- **`text-tiny`** — 0.625rem, for dense metadata.

## Restyling the app

Change the values in `worker/index.css`. Because every component reads tokens,
editing `--primary` in both `:root` and `.dark` restyles every button, link,
badge and focus ring at once.

A brand-colour change is usually just:

```css
:root {
  --primary: oklch(0.55 0.16 250);
  --primary-foreground: oklch(0.98 0 0);
}
.dark {
  --primary: oklch(0.7 0.14 250);
  --primary-foreground: oklch(0.2 0 0);
}
```

Dark-mode values are not the light ones inverted. A saturated colour that reads
well on white is usually too dark on a dark background — raise lightness and
lower chroma a little. Check that the paired foreground still contrasts.

Resist per-component overrides. The moment a component hardcodes a colour, the
next theme change silently skips it.

## Adding a token

Only when a genuinely new semantic role appears — a `warning` state, say, that
`destructive` and `muted` do not cover. Add it in all three places:

```css
:root {
  --warning: oklch(0.75 0.15 85);
  --warning-foreground: oklch(0.25 0.02 85);
}
.dark {
  --warning: oklch(0.7 0.14 85);
  --warning-foreground: oklch(0.15 0.01 85);
}
@theme inline {
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
}
```

Then `bg-warning text-warning-foreground` works in both modes.

## Adding a theme

Themes beyond light/dark are class-based. Three files must agree or the toggle
desynchronises:

1. `worker/index.css` — a class block alongside `.dark`, e.g. `.dusk { … }`,
   redefining **every** token `:root` defines. A missing one falls back to the
   light value.
2. `worker/views/components/NavBar.tsx` — add the name to the `THEMES` array in
   the inline toggle script, and an icon `<i data-theme-icon="dusk" …>`.
3. `worker/components/ui/ThemeProvider.ts` — add it to the `Theme` union and to
   the `classList.remove(...)` call, or switching away leaves the class behind.

## Component patterns

Copy these rather than inventing variants — they are what the existing UI uses.

**Card**

```html
<div class="rounded-2xl border bg-card text-card-foreground shadow-sm p-6">…</div>
```

**Primary / secondary / destructive buttons**

```html
<!-- primary -->
<button
  class="inline-flex items-center justify-center rounded-lg bg-primary px-4 h-10 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
  Save
</button>

<!-- secondary / outline -->
<button
  class="inline-flex items-center justify-center rounded-lg border border-input px-4 h-10 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
  Cancel
</button>

<!-- destructive -->
<button
  class="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
  Delete
</button>
```

**Input**

```html
<input
  class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
/>
```

**Table** — always inside an `overflow-auto` wrapper so wide content scrolls
instead of breaking the page:

```html
<div class="rounded-2xl border bg-card shadow-sm overflow-hidden">
  <div class="relative w-full overflow-auto">
    <table class="w-full caption-bottom text-sm">
      <thead class="[&_tr]:border-b bg-muted/40">
        …
      </thead>
      <tbody class="[&_tr:last-child]:border-0 bg-card">
        …
      </tbody>
    </table>
  </div>
</div>
```

**Page container** — `pt-20` clears the fixed header:

```html
<div class="max-w-4xl mx-auto space-y-8 p-8 pt-20 animate-in fade-in duration-500"></div>
```

**Badge** — `StatusBadge(status, styles, icon)` in `worker/views/lib/utils.ts`
takes a status→classes map. Give it token-based classes, and a `default` key
for unknown statuses.

**Icons** — Lucide, as `<i data-lucide="pencil" class="h-4 w-4"></i>`. They are
replaced on load and after every HTMX swap by the handler in `main.ts`. Size
them with `h-*`/`w-*`; they inherit `currentColor`, so colour the parent.

Only icons registered in `worker/components/lib/icons.ts` render — the bundle
ships ~30 rather than Lucide's full set. Add the import there when you use a
new one; `npm run test` fails with the name and the import if you forget.

## Pitfalls

- **Never build a class name by interpolation.** Tailwind scans source text
  for complete class names, so `bg-chart-${n}` is never generated and the
  colour silently goes missing. Map to full strings instead:

  ```ts
  const ACCENTS = { "1": "bg-chart-1", "2": "bg-chart-2" } as const;
  ```

  After adding classes that only appear in one place, it is worth confirming
  they made it: `grep -c "\.bg-chart-1" dist/client/static/main.css`.
- **Native form controls need `color-scheme`.** `:root` sets
  `color-scheme: light` and `.dark` sets `dark`, which is what makes
  checkboxes, radios, scrollbars and date pickers render in the right scheme.
  A new theme class must set it too, or its checkboxes stay light.

- **Testing one mode only.** Toggle the theme before calling it done; this is
  where hardcoded colours surface.
- **`text-white` on a coloured surface.** Use the paired `*-foreground`.
- **Shadow-only separation.** Add `border` too, or the edge vanishes in dark.
- **A new token in `:root` but not `.dark`.** Silently keeps its light value.
- **Arbitrary values** like `bg-[#f5f5f5]` — they defeat the whole system.
  `bg-muted` almost always covers it.
- **Long content without `truncate` or `line-clamp-*`.** Emails and titles in
  flex rows will blow out the layout; the existing components use `truncate`
  plus `min-w-0` on the flex child.
