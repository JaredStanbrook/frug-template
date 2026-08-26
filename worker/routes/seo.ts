import { Hono } from "hono";

import type { AppEnv } from "@server/types";
import { robotsTxt, sitemapXml, type SitemapEntry } from "@server/lib/seo";

export const seoRoute = new Hono<AppEnv>();

/**
 * The pages a crawler should know about.
 *
 * Add a route here when you add a public page. Anything behind `requireUser`
 * does not belong — a crawler cannot reach it, and listing it just produces
 * redirects in Search Console.
 *
 * For content that lives in the database (published posts, public profiles),
 * query it in the handler below and concatenate. Keep the list under ~50,000
 * URLs; past that, sitemaps have to be split and indexed.
 */
const STATIC_ROUTES: SitemapEntry[] = [{ loc: "/", changefreq: "weekly", priority: 1.0 }];

seoRoute.get("/robots.txt", (c) =>
  c.text(robotsTxt(c.var.app, c.env.ENVIRONMENT), 200, {
    // Crawlers re-fetch this often; a day of caching is plenty and keeps the
    // Worker off the critical path for something that rarely changes.
    "Cache-Control": "public, max-age=86400",
  }),
);

seoRoute.get("/sitemap.xml", async (c) => {
  const entries: SitemapEntry[] = [...STATIC_ROUTES];

  // Example of adding database-backed URLs — delete with the notes feature.
  // Only ever list rows a signed-out visitor can actually load.
  //
  //   const posts = await c.var.db
  //     .select({ slug: post.slug, updatedAt: post.updatedAt })
  //     .from(post)
  //     .where(and(eq(post.published, true), isNull(post.deletedAt)));
  //
  //   entries.push(
  //     ...posts.map((p) => ({ loc: `/posts/${p.slug}`, lastmod: p.updatedAt })),
  //   );

  return c.body(sitemapXml(entries, c.var.app), 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});
