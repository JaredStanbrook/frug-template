import { describe, it, expect } from "vitest";

import { resolveMeta, robotsTxt, sitemapXml } from "../worker/lib/seo";
import type { AppConfig } from "../worker/config/app.config";

const app: AppConfig = {
  name: "Test App",
  tagline: "A tagline",
  locale: "en-AU",
  currency: "AUD",
  origin: "https://example.com",
};

const at = (path: string) => new URL(`https://example.com${path}`);

describe("page metadata", () => {
  it("titles the home page with just the site name", () => {
    expect(resolveMeta({}, app, at("/")).title).toBe("Test App");
    expect(resolveMeta({ title: "Notes" }, app, at("/notes")).title).toBe("Notes · Test App");
  });

  it("prefers a page's own description over the site tagline", () => {
    expect(resolveMeta({ description: "Just this page" }, app, at("/x")).description).toBe(
      "Just this page",
    );
    expect(resolveMeta({}, app, at("/x")).description).toBe("A tagline");
  });

  it("canonicalises away the query string", () => {
    // Tracking params and filters are the same page reached differently;
    // letting each combination rank separately is how a small site
    // accidentally publishes thousands of near-duplicates.
    const meta = resolveMeta({}, app, at("/?utm_source=twitter&ref=x"));
    expect(meta.canonical).toBe("https://example.com/");
  });

  it("builds the canonical from ORIGIN, not the request host", () => {
    // A site reachable on both example.com and a workers.dev preview must
    // still point search engines at one address.
    const meta = resolveMeta({}, app, new URL("https://my-worker.workers.dev/about"));
    expect(meta.canonical).toBe("https://example.com/about");
  });

  it("keeps sign-in pages and filtered views out of the index", () => {
    expect(resolveMeta({}, app, at("/login")).noindex).toBe(true);
    expect(resolveMeta({}, app, at("/register")).noindex).toBe(true);
    expect(resolveMeta({}, app, at("/admin/logs")).noindex).toBe(true);
    expect(resolveMeta({}, app, at("/notes?q=x")).noindex).toBe(true);

    expect(resolveMeta({}, app, at("/")).noindex).toBe(false);
    expect(resolveMeta({}, app, at("/about")).noindex).toBe(false);
  });

  it("lets a route override the default", () => {
    expect(resolveMeta({ noindex: false }, app, at("/notes?q=x")).noindex).toBe(false);
    expect(resolveMeta({ canonical: "https://example.com/x" }, app, at("/y")).canonical).toBe(
      "https://example.com/x",
    );
  });

  it("resolves a relative preview image against the origin", () => {
    expect(resolveMeta({ image: "/og.png" }, app, at("/")).image).toBe(
      "https://example.com/og.png",
    );
  });
});

describe("robots.txt", () => {
  it("blocks everything outside production", () => {
    // A staging copy indexed next to the real site splits its ranking and puts
    // the wrong URL in front of searchers.
    expect(robotsTxt(app, "staging")).toContain("Disallow: /");
    expect(robotsTxt(app, "staging")).not.toContain("Sitemap:");
  });

  it("in production disallows private paths and points at the sitemap", () => {
    const txt = robotsTxt(app, "production");
    expect(txt).toContain("Disallow: /admin");
    expect(txt).toContain("Disallow: /api");
    expect(txt).toContain("Sitemap: https://example.com/sitemap.xml");
    expect(txt).not.toMatch(/^Disallow: \/$/m);
  });
});

describe("sitemap.xml", () => {
  it("emits absolute URLs and formats lastmod as a date", () => {
    const xml = sitemapXml([{ loc: "/", lastmod: new Date("2026-01-02T10:00:00Z") }], app);
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<lastmod>2026-01-02</lastmod>");
  });

  it("escapes characters that would break the XML", () => {
    const xml = sitemapXml([{ loc: "/search?a=1&b=2" }], app);
    expect(xml).toContain("&amp;");
    expect(xml).not.toMatch(/[^&]&(?!amp;|lt;|gt;|apos;|quot;)/);
  });
});
