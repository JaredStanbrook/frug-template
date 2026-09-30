import type { Context } from "hono";

import type { AppEnv } from "../types";

/**
 * Fallback when the binding is absent (tests, or a config that lost it).
 * Unique per isolate rather than a constant, so the worst case is some
 * extra cache misses — never a year-long cache of a stale stylesheet.
 */
const ISOLATE_ID = Date.now().toString(36);

/**
 * The version appended to `/static/*` URLs: the deployment's id from the
 * `CF_VERSION_METADATA` binding, which changes on every deploy.
 */
export const assetVersion = (c: Context<AppEnv>): string => {
  // Optional chaining: tests and the Vite dev server run without the binding.
  return c.env?.CF_VERSION_METADATA?.id || ISOLATE_ID;
};
