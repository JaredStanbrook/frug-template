// worker/routes/api/analytics.ts
//
// POST /api/analytics — where the browser's tracker (worker/components/
// analytics.ts) sends page views, form sends and time on page. Sent with
// navigator.sendBeacon, so the body is JSON as text/plain.
//
// Records nothing, and clears the analytics cookies, unless the visitor has
// allowed performance cookies. That is checked here, on every beacon, not
// only in the browser.

import { Hono } from "hono";

import type { AppEnv } from "../../types";
import { allows } from "../../lib/consent";
import {
  clearAnalyticsCookies,
  prune,
  record,
  type Beacon,
} from "../../services/analytics.service";

const MAX_BODY = 2048;

export const analyticsApi = new Hono<AppEnv>().post("/", async (c) => {
  if (!allows(c, "performance")) {
    clearAnalyticsCookies(c);
    return c.body(null, 204);
  }
  const text = await c.req.text();
  if (text.length > MAX_BODY) return c.body(null, 413);
  let beacon: Beacon;
  try {
    beacon = JSON.parse(text);
  } catch {
    return c.body(null, 400);
  }
  if (!beacon || !["view", "form", "time"].includes(beacon.type)) return c.body(null, 400);

  const id = await record(c, beacon);
  // Now and then, drop rows past the retention period. After the response.
  if (Math.random() < 0.01) {
    const work = prune(c).catch((e) => console.error("Analytics prune failed", e));
    try {
      c.executionCtx.waitUntil(work);
    } catch {
      // No execution context (tests): it runs anyway.
    }
  }
  return id === null ? c.body(null, 204) : c.json({ id });
});
