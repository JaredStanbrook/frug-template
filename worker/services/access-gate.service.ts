import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

import type { AppEnv } from "@server/types";
import { accessLink } from "@server/schema/access.schema";
import type { AccessLinkState, SelectAccessLink } from "@server/schema/access.schema";

type Db = AppEnv["Variables"]["db"];

/** The cookie that keeps an invited visitor let in on later requests. */
export const ACCESS_COOKIE = "site_access";

/**
 * How invitation links behave, from the ACCESS_GATE var:
 *
 *   "off"      no gate. The default, so a missing var never locks anyone out.
 *   "session"  a link works once. Opening it mints a session token for that
 *              browser's cookie; the link is spent, so a forwarded copy is
 *              refused. Best when each link goes to one named person.
 *   "link"     the link is the credential. It keeps working, in any browser,
 *              until it expires or is revoked; the cookie holds the link token
 *              itself. Best for a link shared with a group or opened on
 *              several devices.
 *
 * Either way the clock starts on the first open, not when the link is made.
 * "true" is accepted as "session", the only mode the first version had.
 */
export type GateMode = "off" | "session" | "link";

export const gateMode = (env: { ACCESS_GATE?: string }): GateMode => {
  const value = env.ACCESS_GATE?.trim().toLowerCase();
  if (value === "session" || value === "true") return "session";
  if (value === "link") return "link";
  return "off";
};

export const isGateEnabled = (env: { ACCESS_GATE?: string }) => gateMode(env) !== "off";

type GateEnv = { ACCESS_GATE?: string; ACCESS_GATE_PATHS?: string };

/**
 * The path prefixes the gate guards, from ACCESS_GATE_PATHS (comma
 * separated). Unset or empty means ["/"]: the whole site. "/reports" guards
 * /reports and everything under it, and nothing else.
 */
export const gatedPrefixes = (env: GateEnv): string[] => {
  const list = (env.ACCESS_GATE_PATHS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.length > 1 ? p.replace(/\/+$/, "") : p));
  return list.length ? list : ["/"];
};

/** Whether the gate is on and guards this path. */
export const isGatedPath = (env: GateEnv, path: string) =>
  isGateEnabled(env) &&
  gatedPrefixes(env).some((p) => p === "/" || path === p || path.startsWith(`${p}/`));

/**
 * Whether the gate locks the whole site, rather than a few paths. Only then
 * do robots.txt and the sitemap hide everything.
 */
export const gatesWholeSite = (env: GateEnv) =>
  isGateEnabled(env) && gatedPrefixes(env).includes("/");

export const linkState = (link: SelectAccessLink, now = new Date()): AccessLinkState => {
  if (link.revokedAt) return "revoked";
  if (!link.expiresAt) return "unused";
  return link.expiresAt > now.toISOString() ? "active" : "expired";
};

/**
 * Open a link and return the value for the visitor's cookie, or null when
 * the link does not let them in.
 *
 * The first open starts the clock. The `isNull(firstVisitedAt)` in the update
 * makes that claim atomic, so two visits racing each other cannot both start
 * it. In "session" mode the first open is also the only one: it mints the
 * session token, and any later open gets null. In "link" mode a later open of
 * a live link returns the link token again.
 */
export async function openLink(db: Db, token: string, mode: GateMode, now = new Date()) {
  const [claimed] = await db
    .update(accessLink)
    .set({
      firstVisitedAt: now.toISOString(),
      // The duration is read in SQL so the clock matches what the admin set.
      expiresAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${now.toISOString()}, '+' || ${accessLink.durationHours} || ' hours')`,
      sessionToken: mode === "session" ? crypto.randomUUID() + crypto.randomUUID() : null,
      updatedAt: now.toISOString(),
    })
    .where(
      and(
        eq(accessLink.token, token),
        isNull(accessLink.firstVisitedAt),
        isNull(accessLink.revokedAt),
      ),
    )
    .returning();

  if (claimed) return { link: claimed, cookie: claimed.sessionToken ?? claimed.token };
  if (mode === "session") return null;

  const [link] = await db
    .select()
    .from(accessLink)
    .where(
      and(
        eq(accessLink.token, token),
        isNull(accessLink.revokedAt),
        gt(accessLink.expiresAt, now.toISOString()),
      ),
    );
  return link ? { link, cookie: link.token } : null;
}

/**
 * The live link behind a cookie: not revoked, not expired. In "session" mode
 * only a minted session token matches, so a raw link token is not a cookie.
 * In "link" mode the cookie is the link token.
 */
export async function liveLink(db: Db, cookie: string, mode: GateMode, now = new Date()) {
  const match =
    mode === "session"
      ? eq(accessLink.sessionToken, cookie)
      : or(eq(accessLink.token, cookie), eq(accessLink.sessionToken, cookie));
  const [link] = await db
    .select()
    .from(accessLink)
    .where(and(match, isNull(accessLink.revokedAt), gt(accessLink.expiresAt, now.toISOString())));
  return link ?? null;
}
