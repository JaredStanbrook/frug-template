import type { FC } from "hono/jsx";
import type { Context } from "hono";

import type { AppEnv } from "@server/types";
import { resolveMeta } from "@server/lib/seo";
import { assetVersion } from "@server/lib/asset-version";
import { Layout } from "@views/Layout";

/**
 * The page a visitor sees for a URL that does not exist.
 *
 * The asset layer's own 404 is an empty body: the right status for a
 * crawler, but a dead end for a person who followed an old or mistyped link.
 * This keeps the 404 status and `noindex`, so it never competes with a real
 * page, and gives them a way back in. Add links to your site's main pages.
 */
const NotFoundPage: FC = () => (
  <div class="mx-auto max-w-xl px-4 py-24 text-center">
    <p class="text-sm font-semibold text-muted-foreground">404</p>
    <h1 class="mt-2 text-3xl font-bold tracking-tight">That page isn't here</h1>
    <p class="mt-4 text-muted-foreground">The link may be old, or the address mistyped.</p>
    <a
      href="/"
      class="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground no-underline hover:bg-primary/90"
    >
      Back to the home page
    </a>
  </div>
);

/**
 * Render the not-found page in the site layout with a 404 status.
 *
 * Called from the worker's `notFound`, which runs outside the app's renderer
 * middleware, so the layout is applied here rather than via `c.render`.
 */
export const renderNotFound = (c: Context<AppEnv>) => {
  const meta = resolveMeta(
    { title: "Page not found", noindex: true },
    c.var.app,
    new URL(c.req.url),
  );

  return c.html(
    <Layout
      meta={meta}
      app={c.var.app}
      user={c.var.auth?.user ?? null}
      currentPath={c.req.path}
      assetVersion={assetVersion(c)}
    >
      <NotFoundPage />
    </Layout>,
    404,
  );
};
