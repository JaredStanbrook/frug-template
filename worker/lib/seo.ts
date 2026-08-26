/**
 * Per-page metadata.
 *
 * Server rendering already gives this template the hard half of SEO — a
 * crawler receives complete HTML with no JavaScript step. What it lacked was
 * the metadata around that HTML: every page shared one description, nothing
 * declared a canonical URL, and shared links rendered bare because there were
 * no Open Graph tags.
 *
 * A route sets what differs and inherits the rest:
 *
 *   return c.render(<Page />, {
 *     title: note.title,
 *     description: summarise(note.body),
 *   });
 */

import type { AppConfig } from "../config/app.config";

export interface PageMeta {
  /** Page title, before the site name is appended. */
  title?: string;
  /**
   * ~155 characters, describing *this* page. Search engines treat the same
   * description on every page as a quality signal against the site, so it is
   * worth setting per page rather than letting the site tagline stand in.
   */
  description?: string;
  /** Absolute or root-relative image for link previews. */
  image?: string;
  /** Keep this page out of search results. */
  noindex?: boolean;
  /** Override the canonical URL. Defaults to the current path on ORIGIN. */
  canonical?: string;
  /** `website` for landing pages, `article` for a single piece of content. */
  type?: "website" | "article";
}

export interface ResolvedMeta {
  title: string;
  description: string;
  canonical: string;
  image?: string;
  noindex: boolean;
  type: "website" | "article";
  siteName: string;
  locale: string;
}

/**
 * Paths that should never appear in search results.
 *
 * Authenticated pages are already invisible to a crawler — the guards redirect
 * to /login — so this is about the pages that *are* reachable but have no
 * business ranking. Sign-in and registration forms compete with real content
 * and offer a searcher nothing.
 */
const NOINDEX_PATHS = ["/login", "/register", "/join", "/admin", "/dev", "/api"];

const isNoindexPath = (pathname: string) =>
  NOINDEX_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Fill in everything the page did not specify.
 *
 * The canonical URL deliberately drops the query string. Filtered and searched
 * views (`?q=…`, `?page=2`) are the same content reached differently; pointing
 * them at the bare path stops a crawler treating each combination as its own
 * thin page, which is how a small site accidentally publishes thousands.
 */
export function resolveMeta(meta: PageMeta, app: AppConfig, url: URL): ResolvedMeta {
  const origin = app.origin || url.origin;
  const canonical = meta.canonical ?? new URL(url.pathname, origin).toString();

  const hasQuery = url.search.length > 0;

  return {
    title: meta.title ? `${meta.title} · ${app.name}` : app.name,
    description: meta.description || app.tagline || "",
    canonical,
    image: meta.image ? new URL(meta.image, origin).toString() : undefined,
    // A query string means a filtered view of a page that already exists.
    noindex: meta.noindex ?? (isNoindexPath(url.pathname) || hasQuery),
    type: meta.type ?? "website",
    siteName: app.name,
    locale: app.locale,
  };
}

/**
 * `robots.txt`.
 *
 * Anything that is not production is disallowed outright. A staging copy or a
 * `*.workers.dev` preview indexed alongside the real site splits its ranking
 * and puts the wrong URL in results — and it is invisible until it happens.
 */
export function robotsTxt(app: AppConfig, environment: string): string {
  if (environment !== "production") {
    return ["User-agent: *", "Disallow: /", ""].join("\n");
  }

  return [
    "User-agent: *",
    ...NOINDEX_PATHS.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${new URL("/sitemap.xml", app.origin).toString()}`,
    "",
  ].join("\n");
}

/** One entry in the sitemap. `loc` may be a path or an absolute URL. */
export interface SitemapEntry {
  loc: string;
  lastmod?: string | Date;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

const escapeXml = (value: string) =>
  value.replace(
    /[<>&'"]/g,
    (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[ch]!,
  );

export function sitemapXml(entries: SitemapEntry[], app: AppConfig): string {
  const urls = entries.map((entry) => {
    const loc = escapeXml(new URL(entry.loc, app.origin).toString());
    const lastmod =
      entry.lastmod &&
      (entry.lastmod instanceof Date ? entry.lastmod : new Date(entry.lastmod))
        .toISOString()
        .slice(0, 10);

    return [
      "  <url>",
      `    <loc>${loc}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
      entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : "",
      entry.priority !== undefined ? `    <priority>${entry.priority}</priority>` : "",
      "  </url>",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
