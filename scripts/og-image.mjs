/**
 * Render public/og.png, the default image link previews show for every page.
 *
 * Built from the site itself — APP_NAME and APP_TAGLINE from wrangler.jsonc,
 * the light-theme colour tokens from worker/index.css, and public/favicon.svg
 * — so it matches the brand and cannot silently stay as the template's.
 * 1200×630 is the size Facebook, LinkedIn, Slack and X all display uncropped.
 *
 * After running it, set "APP_OG_IMAGE": "/og.png" in wrangler.jsonc. Re-run
 * it whenever the name, tagline, colours or logo change.
 *
 * Usage (Playwright is not a dependency; this is a one-off tool):
 *   npm i -D playwright            # or reuse a Chromium already on disk:
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/og-image.mjs
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (file) => readFileSync(join(ROOT, file), "utf8");

// Vars are simple `"KEY": "value"` lines; comments in the JSONC are ignored.
const wrangler = read("wrangler.jsonc");
const envVar = (key) => wrangler.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`))?.[1] ?? "";
const name = envVar("APP_NAME") || "App";
const tagline = envVar("APP_TAGLINE");

// The first definition of each token is the light theme's (`:root`).
const css = read("worker/index.css");
const token = (t, fallback) =>
  css
    .match(new RegExp(`--${t}:\\s*([^;]+);`))?.[1]
    .replace(/\/\*.*?\*\//g, "")
    .trim() ?? fallback;

const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

const html = `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  html, body { margin: 0; }
  body {
    width: 1200px; height: 630px; box-sizing: border-box; padding: 80px;
    background: ${token("background", "#fff")}; color: ${token("foreground", "#111")};
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    border-bottom: 16px solid ${token("primary", "#333")};
  }
  .brand { display: flex; align-items: center; gap: 24px; font-size: 44px; font-weight: 700; }
  .brand svg { width: 72px; height: 72px; }
  h1 { font-size: 72px; line-height: 1.05; margin: 0; letter-spacing: -0.02em; max-width: 1040px; }
</style></head>
<body>
  <div class="brand">${read("public/favicon.svg")}<span>${escapeHtml(name)}</span></div>
  <h1>${escapeHtml(tagline || name)}</h1>
  <div></div>
</body></html>`;

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "load" });
await page.screenshot({ path: join(ROOT, "public/og.png"), type: "png" });
await browser.close();

console.log('Wrote public/og.png. Set "APP_OG_IMAGE": "/og.png" in wrangler.jsonc to use it.');
