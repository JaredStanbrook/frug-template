import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

/**
 * Refuse to serve anything when JWT_SECRET is missing.
 *
 * This is deliberately fail-closed. Without the secret the app does not
 * degrade gracefully — it degrades *invisibly* in two directions at once:
 *
 *  - `parseAuthConfig` used to fall back to the literal string "default",
 *    so admin session JWTs were signed with a value that is public in the
 *    template's source. Anyone could mint one.
 *  - `setSignedCookie` throws on an undefined secret, but only on the paths
 *    that actually set a cookie. On the site this template was extracted
 *    from, that meant a *wrong* credential gave a correct error page and the
 *    *right* one gave an opaque 500 — the one working path was the only one
 *    that failed, which is about the worst place for the error to surface.
 *
 * A site that is plainly down beats one that is quietly forgeable and
 * confusingly broken, so this returns a message naming the exact fix.
 * Secrets apply immediately — setting it needs no redeploy.
 */
export const requireSecrets = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.JWT_SECRET) return next();

  console.error("[config] JWT_SECRET is not set; refusing to serve. See docs/deploy.md.");

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>Not configured</title>
    <style>
      body { margin: 0; padding: 2rem; background: #fff; color: #000;
             font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.5; }
      main { max-width: 34rem; margin: 10vh auto; border: 4px solid #000; padding: 1.5rem;
             box-shadow: 8px 8px 0 0 #000; }
      h1 { margin: 0 0 .5rem; font-size: 1.5rem; text-transform: uppercase;
           letter-spacing: -.02em; }
      code { font-family: ui-monospace, monospace; background: #f2f2f2;
             border: 2px solid #000; padding: 0 .25rem; }
      ol { padding-left: 1.25rem; }
      @media (prefers-color-scheme: dark) {
        body { background: #000; color: #fff; }
        main { border-color: #fff; box-shadow: 8px 8px 0 0 #fff; }
        code { background: #1a1a1a; border-color: #fff; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Not configured</h1>
      <p><code>JWT_SECRET</code> is not set on this Worker, so sessions and any
         signed cookie cannot be trusted. Nothing is being served until it
         is.</p>
      <ol>
        <li>Cloudflare dashboard &rarr; this Worker &rarr; Settings &rarr;
            Variables and Secrets.</li>
        <li>Add <code>JWT_SECRET</code> with type <strong>Secret</strong> — not a
            plaintext variable, and not a <em>Build</em> variable, which exists
            only during the build and is undefined at runtime.</li>
        <li>Reload. Secrets take effect immediately; no redeploy is needed.</li>
      </ol>
      <p>Full walkthrough: <code>docs/deploy.md</code>.</p>
    </main>
  </body>
</html>`;

  return c.html(html, 503, { "Cache-Control": "no-store" });
});
