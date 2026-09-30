import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../types";

/**
 * One address per page, enforced before anything renders.
 *
 * - **HTTP → HTTPS.** Cloudflare answers plain `http://` on the custom domain
 *   with a 200 unless the zone's "Always Use HTTPS" is on, which left every
 *   page reachable at two addresses. Scoped to ORIGIN's host, so
 *   `*.workers.dev` previews are untouched. HSTS then tells browsers to skip
 *   the HTTP hop from the first visit on.
 *
 *   The scheme comes from Cloudflare's `CF-Visitor` header, not from the
 *   request URL. `wrangler dev` rewrites the URL to the production host while
 *   serving plain HTTP on localhost, so trusting the URL redirected a local
 *   preview to itself forever. The edge always sets `CF-Visitor`; nothing
 *   local does, so without it this does nothing rather than loop.
 * - **`/notes/` → `/notes`.** Routes are declared without a trailing
 *   slash, so the slashed form was a 404 for anyone who typed or linked it
 *   that way. GET and HEAD only: a redirected POST would lose its body.
 *
 * Both are 301s — the moves are permanent, and a permanent redirect is what
 * passes a link's value on to the canonical URL.
 */
export const canonicalUrl: MiddlewareHandler<AppEnv> = async (c, next) => {
  const url = new URL(c.req.url);
  const origin = c.env.ORIGIN ? new URL(c.env.ORIGIN) : null;
  const isCanonicalHost =
    origin !== null && origin.protocol === "https:" && url.hostname === origin.hostname;
  const isRead = c.req.method === "GET" || c.req.method === "HEAD";

  if (isCanonicalHost && visitorScheme(c.req.header("CF-Visitor")) === "http") {
    url.protocol = "https:";
    return c.redirect(url.toString(), 301);
  }

  if (isRead && url.pathname.length > 1 && url.pathname.endsWith("/")) {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return c.redirect(path + url.search, 301);
  }

  await next();

  if (isCanonicalHost && url.protocol === "https:") {
    c.header("Strict-Transport-Security", "max-age=31536000");
  }
};

/** `{"scheme":"http"}` → `"http"`; anything unreadable → null. */
const visitorScheme = (header: string | undefined): string | null => {
  if (!header) return null;
  try {
    const scheme = (JSON.parse(header) as { scheme?: unknown }).scheme;
    return typeof scheme === "string" ? scheme : null;
  } catch {
    return null;
  }
};
