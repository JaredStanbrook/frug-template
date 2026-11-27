import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";
import { htmxToast } from "@server/lib/htmx-helpers";

/**
 * Per-IP throttle for anything that signs in, signs up or sends email, from
 * the RATE_LIMITER binding in wrangler.jsonc.
 *
 * A cheap edge-level backstop that runs before any database work. The
 * per-account defences in the auth service (the lockout, the one-link-a-minute
 * rule) are the real ones, since an attacker can rotate IPs but not the
 * target account. Skipped when the binding is absent so `npm run dev` and
 * tests still work.
 */
export const authRateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const limiter = c.env.RATE_LIMITER;
  if (!limiter) return next();

  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
  const { success } = await limiter.limit({ key: `auth:${ip}` });

  if (!success) {
    const message = "Too many requests. Please slow down and try again.";
    // HTMX does not swap a 429, so a form would just sit there; say it in a toast.
    if (c.req.header("HX-Request")) {
      htmxToast(c, message, { type: "error" });
      return c.body(null, 429);
    }
    return c.json({ error: message }, 429);
  }

  await next();
});
