/**
 * The icon set this app ships.
 *
 * Lucide has ~1600 icons and its UMD bundle is 377KB. Importing them
 * individually lets the bundler drop the rest, so the client pays for the
 * handful actually used instead of the whole library.
 *
 * The cost of that trade is this file: an icon used in markup but missing here
 * renders as nothing. `renderIcons()` warns about exactly that, and
 * `tests/icons.test.ts` fails the build for any `data-lucide="…"` literal in
 * the source that is not registered — so the usual case is caught before it
 * ships, and the dynamic case is caught in the console.
 *
 * ADDING AN ICON: find it at https://lucide.dev, import it below in
 * PascalCase, and add it to `ICONS`. Nothing else to touch.
 */

import {
  createIcons,
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  CircleCheck,
  CircleUser,
  CircleX,
  Database,
  Info,
  KeyRound,
  Laptop,
  Layers,
  Loader2,
  LogOut,
  Menu,
  Moon,
  NotebookPen,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  ShieldCheck,
  Skull,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  User,
  X,
  Zap,
} from "lucide";

export const ICONS = {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  CircleCheck,
  CircleUser,
  CircleX,
  Database,
  Info,
  KeyRound,
  Laptop,
  Layers,
  Loader2,
  LogOut,
  Menu,
  Moon,
  NotebookPen,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  ShieldCheck,
  Skull,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  User,
  X,
  Zap,
};

/** `data-lucide="arrow-left"` is the export `ArrowLeft`. */
const toExportName = (kebab: string) =>
  kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

/**
 * Replace every `<i data-lucide="…">` in `root` with its SVG.
 *
 * Safe to call repeatedly — Lucide replaces the placeholder element, so an
 * already-rendered icon is simply not found again. Call it after any DOM the
 * server just swapped in, which `main.ts` does on `htmx:afterSwap`.
 */
export function renderIcons(root: ParentNode = document) {
  warnAboutMissing(root);
  createIcons({ icons: ICONS, nameAttr: "data-lucide" });
}

/**
 * A missing icon is invisible rather than loud, which makes it easy to ship.
 * Naming it in the console turns a "why is there a gap" into a one-line fix.
 */
function warnAboutMissing(root: ParentNode) {
  const missing = new Set<string>();

  for (const el of root.querySelectorAll("[data-lucide]")) {
    const name = el.getAttribute("data-lucide");
    if (name && !(toExportName(name) in ICONS)) missing.add(name);
  }

  if (missing.size > 0) {
    console.warn(
      `[icons] not registered: ${[...missing].join(", ")}. ` +
        `Add them to worker/components/lib/icons.ts or they will render as nothing.`,
    );
  }
}
