# Front-end Style Guide

The patterns used across `worker/views/`, `worker/components/` and
`worker/index.css`.

## 1. Core principles

- **Efficiency**: minimal JavaScript on the client; logic stays server-side.
- **Interactivity**: **HTMX** for partial page updates without full reloads.
- **Theming**: CSS-variable palettes with a light/dark/system toggle.
- **Responsiveness**: mobile-first with Tailwind.

## 2. Stack

- **Engine**: Hono JSX (server-side rendering).
- **Styling**: **Tailwind CSS v4**, colors in OKLCH.
- **Icons**: [Lucide](https://lucide.dev/), via `<i data-lucide="name">`.
- **Dynamic UI**: [HTMX](https://htmx.org/) for AJAX and DOM swapping.
- **Web Components**: Lit elements (`<theme-provider>`, `<app-toaster>`) for
  global state and feedback only.

## 3. Theming

Shadcn-style CSS variables defined in `worker/index.css`:

| Theme      | Applied as                     | Notes             |
| :--------- | :----------------------------- | :---------------- |
| **Light**  | `:root`                        | Default           |
| **Dark**   | `.dark` on `<html>`            |                   |
| **System** | Follows `prefers-color-scheme` | Default selection |

The theme is stored in `localStorage` under `vite-ui-theme` and applied by
`<theme-provider>` before first paint. The toggle in `NavBar.tsx` cycles
light → dark → system.

To add a palette, define a class alongside `.dark` in `index.css` and add its
name to the `THEMES` array in `NavBar.tsx` and the `Theme` union in
`components/ui/ThemeProvider.ts`. All three must agree or the toggle desyncs.

### Color tokens (OKLCH)

`oklch` is used for perceptually uniform colors across themes:

- `--primary` — main action color.
- `--background` / `--foreground` — canvas and text.
- `--muted` / `--muted-foreground` — secondary text and subtle fills.
- `--accent` — interactive highlights.
- `--destructive` — deletes and errors.

Use the Tailwind classes these map to (`bg-background`, `text-muted-foreground`)
rather than raw colors, so every theme stays consistent automatically.

## 4. Typography

- **Sans**: `Montserrat` — UI, buttons, headings.
- **Serif**: `Domine` — long-form content and stylistic accents.
- **Mono**: `Source Code Pro` — code and technical data.

Set in the `--font-*` variables in `index.css`.

## 5. Layout

- **Shell**: `views/Layout.tsx`.
  - **Header**: fixed, `backdrop-blur` glassmorphism, global navigation.
  - **Main**: `hx-boost="true"` converts ordinary link clicks into AJAX swaps.
  - **Footer**: site tagline.
- **Containers**: `max-w-*` plus `mx-auto`; pages start at `pt-20` to clear the
  fixed header.

## 6. Components

- **Dropdowns**: native `<details>` / `<summary>`, styled with Tailwind. They
  are accessible and work without JavaScript.
- **Buttons**:
  - **Primary**: solid `bg-primary`, high contrast.
  - **Ghost / outline**: transparent, border or hover accent.
  - **Destructive**: `text-destructive` with a `hover:bg-destructive/10` fill.
- **Navigation**: `currentPath` drives active state — `text-foreground` when
  active, `text-muted-foreground` otherwise.
- **Tables**: wrapped in `overflow-auto` inside a rounded bordered card, so
  wide content scrolls instead of breaking the page.

## 7. Animation and interactivity

- **Transitions**: `transition-colors` with `duration-200` on hover states.
- **Entry**: `animate-in fade-in duration-500` on page containers.
- **HTMX swapping**: `hx-swap="outerHTML"` to replace an element, or
  `hx-swap="none"` with an `HX-Refresh` header when the server wants a reload.

---

### Layout skeleton

```tsx
<body class="bg-background text-foreground antialiased min-h-screen font-sans flex flex-col">
  <theme-provider defaultTheme="system"></theme-provider>
  {NavBar({ appName, user, currentPath })}
  <main hx-boost="true" id="main-content" class="relative flex-grow w-full">
    {props.children}
  </main>
  <div id="modal-container"></div>
  <app-toaster></app-toaster>
  <footer class="...">...</footer>
</body>
```
