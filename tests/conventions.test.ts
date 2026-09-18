import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Static checks for two styling mistakes that type-check, lint clean, and
 * render without throwing — so nothing else in this suite can catch them. Both
 * shipped in the site this template was extracted from, and both were only
 * noticed by a human looking at the wrong mode or the wrong device.
 *
 * Add a `theme-exempt` marker at the end of a line to opt out, for the case
 * that is genuinely right — a QR code that must sit on white whatever the
 * theme does, say.
 */

const ROOTS = ["worker/views", "worker/components", "worker/routes"];

const sourceFiles = (dir: string): string[] => {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

interface Line {
  file: string;
  line: number;
  text: string;
}

/** Source lines, minus comments and anything explicitly exempted. */
const codeLines = (): Line[] =>
  ROOTS.flatMap((root) =>
    sourceFiles(root).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((text, i) => ({ file, line: i + 1, text })),
    ),
  ).filter(({ text }) => {
    const trimmed = text.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*"))
      return false;
    return !text.includes("theme-exempt");
  });

const report = (hits: Line[]) =>
  hits.map((h) => `${h.file}:${h.line}  ${h.text.trim().slice(0, 100)}`);

describe("styling conventions", () => {
  /**
   * The raw Tailwind palette has no dark-mode counterpart. A pale tint paired
   * with dark text — `bg-emerald-100 text-emerald-800` — reads correctly in
   * light mode and renders dark-on-dark the moment the theme flips. That is
   * exactly how the profile page shipped its status badges.
   *
   * So this bans the extreme tints (50–200 and 700–950), which only work in
   * one mode, unless the line also carries a `dark:` variant. Mid tints
   * (300–600) are legible either way and are left alone.
   *
   * The fix is almost never a `dark:` override — it is a semantic token.
   * `success` and `warning` exist alongside `primary`, `destructive` and the
   * rest so that status UI never has to reach for the palette at all.
   */
  it("uses theme tokens rather than mode-specific palette tints", () => {
    const families =
      "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
    const extremeTint = new RegExp(
      `\\b(?:bg|text|border|ring|fill|stroke|from|via|to)-(?:${families})-(?:50|100|200|700|800|900|950)\\b`,
    );

    const hits = codeLines().filter(
      ({ text }) => extremeTint.test(text) && !text.includes("dark:"),
    );

    expect(report(hits), "Mode-specific palette tints break dark mode").toEqual([]);
  });

  /**
   * A control revealed only on hover does not exist on a touch device: there
   * is no hover, so it can never be shown and never be tapped. The profile
   * page hid its only "edit your display name" button this way, and the
   * toaster hid its only dismiss button, leaving a phone no way to do either.
   *
   * Reveal-on-hover is fine for decoration. It is never fine for the only way
   * to perform an action.
   */
  it("has no hover-only interactive controls", () => {
    const hits = codeLines().filter(({ text }) =>
      /opacity-0[^"]*group-hover:opacity-100/.test(text),
    );

    expect(report(hits), "Hover-only controls are unreachable on touch").toEqual([]);
  });
});
