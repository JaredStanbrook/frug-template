import { jsxRenderer } from "hono/jsx-renderer";
import { Layout } from "../views/Layout";
import { resolveMeta, type PageMeta } from "../lib/seo";

declare module "hono" {
  interface ContextRenderer {
    /**
     * `c.render(view, { title: "Notes" })` at minimum. Anything else in
     * `PageMeta` — description, image, noindex, canonical — overrides the
     * default resolved from the request and the site config.
     */
    (content: string | Promise<string>, props: PageMeta): Response;
  }
}

/**
 * Wraps every SSR response in the site Layout.
 *
 * Anything the shell needs on every page (the signed-in user, site branding,
 * the page's metadata) is gathered here once rather than threaded through each
 * route.
 */
export const globalRenderer = jsxRenderer(async ({ children, ...pageMeta }, c) => {
  const app = c.var.app;
  const user = c.var.auth?.user || null;
  const meta = resolveMeta(pageMeta as PageMeta, app, new URL(c.req.url));

  return (
    <Layout meta={meta} app={app} user={user} currentPath={c.req.path}>
      {children}
    </Layout>
  );
});
