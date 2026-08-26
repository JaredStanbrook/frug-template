import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { ICONS } from "../worker/components/lib/icons";

/**
 * Icons are imported individually so the bundle carries ~30 of Lucide's ~1600
 * rather than all 377KB of them. The cost is that an icon used in markup but
 * missing from the registry renders as nothing — silently.
 *
 * This test closes that gap for every name written as a literal in the source,
 * which is nearly all of them. Names built at runtime are caught instead by the
 * console warning in `renderIcons`.
 */

const SOURCE_ROOT = join(import.meta.dirname, "..", "worker");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const toExportName = (kebab: string) =>
  kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

/** Every icon name written as a string literal anywhere under worker/. */
const usedIcons = () => {
  const found = new Map<string, string>(); // icon name -> first file using it

  for (const path of walk(SOURCE_ROOT)) {
    if (!/\.(ts|tsx)$/.test(path)) continue;
    if (path.endsWith("components/lib/icons.ts")) continue; // the registry itself

    const source = readFileSync(path, "utf-8");
    const relative = path.slice(SOURCE_ROOT.length + 1);

    // <i data-lucide="pencil">  and  data-lucide={cond ? "search-x" : "pin"}
    for (const [, name] of source.matchAll(/data-lucide=(?:"|\{[^}]*?")([a-z][a-z0-9-]*)"/g)) {
      if (!found.has(name)) found.set(name, relative);
    }
    // The second and later branches of a ternary, plus `icon: "zap"` tables.
    for (const [, name] of source.matchAll(/\bicon:\s*"([a-z][a-z0-9-]*)"/g)) {
      if (!found.has(name)) found.set(name, relative);
    }
    for (const [, a, b] of source.matchAll(
      /data-lucide=\{[^}]*\?\s*"([a-z][a-z0-9-]*)"\s*:\s*"([a-z][a-z0-9-]*)"/g,
    )) {
      if (!found.has(a)) found.set(a, relative);
      if (!found.has(b)) found.set(b, relative);
    }
  }

  return found;
};

describe("icon registry", () => {
  it("registers every icon the source names", () => {
    const used = usedIcons();

    // Guard against the scan silently matching nothing and passing vacuously.
    expect(used.size).toBeGreaterThan(10);

    const missing = [...used.entries()]
      .filter(([name]) => !(toExportName(name) in ICONS))
      .map(([name, file]) => `${name} (used in ${file}) -> add ${toExportName(name)}`);

    expect(
      missing,
      `Unregistered icons. Import them in worker/components/lib/icons.ts:\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("every registered icon is a usable Lucide definition", () => {
    for (const [name, icon] of Object.entries(ICONS)) {
      expect(Array.isArray(icon), `${name} is not a Lucide icon`).toBe(true);
    }
  });
});
