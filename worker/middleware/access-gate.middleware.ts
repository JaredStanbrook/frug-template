import { createMiddleware } from "hono/factory";
import { deleteCookie, getCookie } from "hono/cookie";

import type { AppEnv } from "../types";
import { htmxRedirect } from "@server/lib/htmx-helpers";
import { ACCESS_COOKIE, gateMode, liveLink } from "@server/services/access-gate.service";

/**
 * Reachable without a link. Sign-in and sign-up have to be, or an admin could
 * never get past the gate; the JSON API has its own auth; the bundle, fonts
 * and favicon are what the "nothing to see here" page itself needs. Add a
 * path here only if a locked-out visitor must reach it.
 */
const OPEN_PREFIXES = ["/api/", "/static/", "/fonts/", "/web/auth/", "/a/"];
const OPEN_PATHS = ["/gone", "/login", "/register", "/favicon.svg"];

/**
 * Lock the site to invited visitors while ACCESS_GATE is "session" or "link".
 *
 * Mounted once in app.tsx ahead of the routes, so every route is gated unless
 * it is listed above. A signed-in admin sees everything. Anyone else needs a
 * live `site_access` cookie, which only `/a/:token` hands out.
 *
 * Files in public/ are served by Cloudflare without running the worker, so
 * the gate cannot see them. To gate them too, set `run_worker_first` in
 * wrangler.jsonc (see the comment there).
 */
export const accessGate = createMiddleware<AppEnv>(async (c, next) => {
  const mode = gateMode(c.env);
  if (mode === "off") return next();
  if (c.var.auth.user?.roles.includes("admin")) return next();

  const path = c.req.path;
  if (OPEN_PATHS.includes(path) || OPEN_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return next();
  }

  const cookie = getCookie(c, ACCESS_COOKIE);
  if (cookie && (await liveLink(c.var.db, cookie, mode))) {
    c.set("accessGranted", true);
    return next();
  }

  if (cookie) deleteCookie(c, ACCESS_COOKIE, { path: "/" });
  if (c.req.header("HX-Request")) return htmxRedirect(c, "/gone");
  return c.redirect("/gone");
});
