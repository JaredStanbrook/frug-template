import { jsxRenderer } from "hono/jsx-renderer";
import { Layout } from "../views/Layout";

declare module "hono" {
  interface ContextRenderer {
    (content: string | Promise<string>, props: { title: string }): Response;
  }
}

/**
 * Wraps every SSR response in the site Layout.
 *
 * Anything the shell needs on every page (the signed-in user, site branding,
 * a global counter in the navbar) is gathered here once rather than threaded
 * through each route.
 */
export const globalRenderer = jsxRenderer(async ({ children, title }, c) => {
  const app = c.var.app;
  const user = c.var.auth?.user || null;

  return (
    <Layout
      title={title ? `${title} · ${app.name}` : app.name}
      app={app}
      user={user}
      currentPath={c.req.path}
    >
      {children}
    </Layout>
  );
});
