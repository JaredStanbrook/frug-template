import { jsxRenderer } from "hono/jsx-renderer";
import { Layout } from "../views/Layout";
import { resolveMeta, type PageMeta } from "../lib/seo";
import { assetVersion } from "../lib/asset-version";
import { isGateEnabled } from "../services/access-gate.service";

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
export const globalRenderer = jsxRenderer(
  async ({ children, ...pageMeta }, c) => {
    const app = c.var.app;
    const user = c.var.auth?.user || null;
    const meta = resolveMeta(pageMeta as PageMeta, app, new URL(c.req.url));
    // A visitor the access gate has not let in (on /gone, /login, /register)
    // gets no nav and no tagline or share image in the head: each would
    // describe the site being kept private.
    if (isGateEnabled(c.env) && !c.var.accessGranted && !user?.roles.includes("admin")) {
      meta.bare = true;
      meta.description = "This site is not open to the public yet.";
      meta.image = undefined;
      meta.jsonLd = [];
    }

    return (
      <Layout
        meta={meta}
        app={app}
        user={user}
        currentPath={c.req.path}
        assetVersion={assetVersion(c)}
      >
        {children}
      </Layout>
    );
  },
  // Layout emits its own doctype. jsxRenderer prepends one unless told not to,
  // which otherwise puts two at the top of every page.
  { docType: false },
);
