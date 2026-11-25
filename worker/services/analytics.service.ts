// worker/services/analytics.service.ts
//
// First-party analytics (worker/schema/analytics.schema.ts): recording page
// views, form sends and time on page for visitors who allowed performance
// cookies, and the reports on /admin/analytics.
//
// Everything that writes is scoped by the visitor's own session cookie, so a
// beacon can only ever touch its own rows.

import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";

import type { AppEnv } from "../types";
import { analyticsEvent, type AnalyticsKind } from "../schema/analytics.schema";
import { users } from "../schema/auth.schema";
import { randomBase64Url } from "../lib/crypto";

export const VISITOR_COOKIE = "_fa_vid";
export const SESSION_COOKIE = "_fa_sid";
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;
const SESSION_MAX_AGE = 60 * 30;
const ID = /^[A-Za-z0-9_-]{16,64}$/;
/** Longer than this in view is someone who left the tab open, not reading. */
const MAX_TIME_ON_PAGE = 30 * 60 * 1000;
const MAX_LOAD = 60 * 1000;
const BOTS = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime/i;

// ==========================================
// WHAT A BROWSER IS
// ==========================================

/** A user-agent boiled down to three words; the string itself is never kept. */
export function summariseUserAgent(ua: string) {
  const device = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua)
    ? "tablet"
    : /Mobi|iPhone|iPod|Android/i.test(ua)
      ? "mobile"
      : "desktop";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Other";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux|CrOS/.test(ua)
            ? "Linux"
            : "Other";
  return { device, browser, os };
}

/** A path on this site, without its query or fragment, or null if it is not one. */
export function cleanPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const path = raw.split(/[?#]/)[0];
  return path.length <= 300 ? path : path.slice(0, 300);
}

/** This site's own host names: the one asked for, and the configured ORIGIN. */
function ownHosts(c: Context<AppEnv>): string[] {
  const hosts = [new URL(c.req.url).hostname];
  try {
    if (c.env.ORIGIN) hosts.push(new URL(c.env.ORIGIN).hostname);
  } catch {
    // A malformed ORIGIN: the request's host still counts.
  }
  return hosts;
}

/** Another site's host, or a utm_source; null for direct visits and this site. */
export function sourceOf(
  referrer: unknown,
  utmSource: unknown,
  ownHosts: string | string[],
): string | null {
  if (typeof utmSource === "string" && /^[\w.-]{1,60}$/.test(utmSource)) {
    return utmSource.toLowerCase();
  }
  if (typeof referrer !== "string" || !referrer) return null;
  try {
    const bare = (h: string) => h.replace(/^www\./, "");
    const host = bare(new URL(referrer).hostname);
    const own = (Array.isArray(ownHosts) ? ownHosts : [ownHosts]).map(bare);
    return host && !own.includes(host) ? host.slice(0, 100) : null;
  } catch {
    return null;
  }
}

const ms = (v: unknown, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : null;

// ==========================================
// THE VISITOR'S COOKIES
// ==========================================

const secure = (c: Context) =>
  c.req.url.startsWith("https://") || c.req.header("x-forwarded-proto") === "https";

/** The visitor and session ids, minting them (and their cookies) when absent. */
function ensureIds(c: Context<AppEnv>) {
  const read = (name: string) => {
    const v = getCookie(c, name);
    return v && ID.test(v) ? v : null;
  };
  const visitorId = read(VISITOR_COOKIE) ?? randomBase64Url(16);
  const sessionId = read(SESSION_COOKIE) ?? randomBase64Url(16);
  const opts = { path: "/", sameSite: "Lax" as const, secure: secure(c), httpOnly: true };
  setCookie(c, VISITOR_COOKIE, visitorId, { ...opts, maxAge: VISITOR_MAX_AGE });
  // Renewed with every page, so a session is 30 minutes since the last one.
  setCookie(c, SESSION_COOKIE, sessionId, { ...opts, maxAge: SESSION_MAX_AGE });
  return { visitorId, sessionId };
}

/** Removes the analytics cookies, for a visitor who withdraws consent. */
export function clearAnalyticsCookies(c: Context) {
  for (const name of [VISITOR_COOKIE, SESSION_COOKIE]) deleteCookie(c, name, { path: "/" });
}

// ==========================================
// RECORDING
// ==========================================

export interface Beacon {
  type: "view" | "form" | "time";
  path?: unknown;
  target?: unknown;
  referrer?: unknown;
  utmSource?: unknown;
  loadMs?: unknown;
  /** For "time": the row returned when the view was recorded. */
  id?: unknown;
  timeOnPageMs?: unknown;
}

/**
 * Records one beacon. Returns the new row's id for a view (the browser sends
 * it back with the time on page), or null when nothing was recorded.
 * The caller has already checked consent.
 */
export async function record(c: Context<AppEnv>, b: Beacon): Promise<number | null> {
  const ua = c.req.header("user-agent") ?? "";
  if (BOTS.test(ua)) return null;
  const db = c.var.db;

  if (b.type === "time") {
    const sessionId = getCookie(c, SESSION_COOKIE);
    const time = ms(b.timeOnPageMs, MAX_TIME_ON_PAGE);
    if (!sessionId || typeof b.id !== "number" || time === null) return null;
    // Only this visitor's own view. Sent each time the tab hides, so keep
    // the longest: the visitor may come back to the page and read on.
    await db
      .update(analyticsEvent)
      .set({ timeOnPageMs: sql`max(coalesce(${analyticsEvent.timeOnPageMs}, 0), ${time})` })
      .where(
        and(
          eq(analyticsEvent.id, b.id),
          eq(analyticsEvent.sessionId, sessionId),
          eq(analyticsEvent.kind, "view"),
        ),
      );
    return null;
  }

  const kind: AnalyticsKind = b.type === "form" ? "form" : "view";
  const path = cleanPath(b.path);
  // The site's own back office is not part of how visitors use it.
  if (!path || /^\/(admin|dev)(\/|$)/.test(path)) return null;
  const { visitorId, sessionId } = ensureIds(c);
  const cf = (c.req.raw as { cf?: { country?: string } }).cf;
  const [row] = await db
    .insert(analyticsEvent)
    .values({
      visitorId,
      sessionId,
      userId: c.var.auth?.user?.id ?? null,
      kind,
      path,
      target: kind === "form" ? cleanPath(b.target) : null,
      source: kind === "view" ? sourceOf(b.referrer, b.utmSource, ownHosts(c)) : null,
      ...summariseUserAgent(ua),
      country: typeof cf?.country === "string" ? cf.country.slice(0, 2) : null,
      loadMs: kind === "view" ? ms(b.loadMs, MAX_LOAD) : null,
    })
    .returning({ id: analyticsEvent.id });
  return kind === "view" ? (row?.id ?? null) : null;
}

/** Deletes rows older than the retention period (ANALYTICS_RETENTION_DAYS, default 395). */
export async function prune(c: Context<AppEnv>) {
  const days = Number(c.env.ANALYTICS_RETENTION_DAYS) || 395;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  await c.var.db.delete(analyticsEvent).where(lt(analyticsEvent.createdAt, cutoff));
}

// ==========================================
// REPORTS
// ==========================================

const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export interface Report {
  days: number;
  totals: {
    views: number;
    visitors: number;
    sessions: number;
    signedIn: number;
    avgTimeMs: number | null;
    avgLoadMs: number | null;
    forms: number;
  };
  pages: { path: string; views: number; avgTimeMs: number | null; avgLoadMs: number | null }[];
  slow: { path: string; views: number; avgLoadMs: number }[];
  sources: { source: string; views: number }[];
  devices: { label: string; views: number }[];
  browsers: { label: string; views: number }[];
  countries: { label: string; views: number }[];
  journeys: {
    at: string;
    form: string;
    target: string | null;
    user: string | null;
    steps: string[];
  }[];
  /** Signed-in visitors, most active first, for their own journeys. */
  people: { userId: string; name: string; views: number; lastAt: string }[];
}

/** Everything /admin/analytics shows, for the last `days` days. Single-table queries, run together. */
export async function report(c: Context<AppEnv>, days: number): Promise<Report> {
  const db = c.var.db;
  const e = analyticsEvent;
  const from = since(days);
  const inRange = gte(e.createdAt, from);
  const views = and(inRange, eq(e.kind, "view"));
  const count = sql<number>`count(*)`;
  const by = (col: typeof e.device | typeof e.browser | typeof e.country) =>
    db
      .select({ label: sql<string>`coalesce(${col}, 'Unknown')`, views: count })
      .from(e)
      .where(views)
      .groupBy(col)
      .orderBy(desc(count))
      .limit(8);

  const [totals, pages, slow, sources, devices, browsers, countries, forms, people] =
    await Promise.all([
      db
        .select({
          views: sql<number>`sum(case when ${e.kind} = 'view' then 1 else 0 end)`,
          visitors: sql<number>`count(distinct ${e.visitorId})`,
          sessions: sql<number>`count(distinct ${e.sessionId})`,
          signedIn: sql<number>`count(distinct ${e.userId})`,
          avgTimeMs: sql<number | null>`avg(${e.timeOnPageMs})`,
          avgLoadMs: sql<number | null>`avg(${e.loadMs})`,
          forms: sql<number>`sum(case when ${e.kind} = 'form' then 1 else 0 end)`,
        })
        .from(e)
        .where(inRange),
      db
        .select({
          path: e.path,
          views: count,
          avgTimeMs: sql<number | null>`avg(${e.timeOnPageMs})`,
          avgLoadMs: sql<number | null>`avg(${e.loadMs})`,
        })
        .from(e)
        .where(views)
        .groupBy(e.path)
        .orderBy(desc(count))
        .limit(15),
      db
        .select({ path: e.path, views: count, avgLoadMs: sql<number>`avg(${e.loadMs})` })
        .from(e)
        .where(and(views, isNotNull(e.loadMs)))
        .groupBy(e.path)
        .having(sql`count(*) >= 3`)
        .orderBy(desc(sql`avg(${e.loadMs})`))
        .limit(8),
      db
        .select({ source: sql<string>`coalesce(${e.source}, 'Direct')`, views: count })
        .from(e)
        .where(views)
        .groupBy(e.source)
        .orderBy(desc(count))
        .limit(10),
      by(e.device),
      by(e.browser),
      by(e.country),
      db
        .select({
          at: e.createdAt,
          path: e.path,
          target: e.target,
          sessionId: e.sessionId,
          userId: e.userId,
        })
        .from(e)
        .where(and(inRange, eq(e.kind, "form")))
        .orderBy(desc(e.createdAt))
        .limit(15),
      db
        .select({ userId: e.userId, views: count, lastAt: sql<string>`max(${e.createdAt})` })
        .from(e)
        .where(and(views, isNotNull(e.userId)))
        .groupBy(e.userId)
        .orderBy(desc(count))
        .limit(15),
    ]);

  // The pages each of those sessions saw before the form went.
  const sessionIds = [...new Set(forms.map((f) => f.sessionId))];
  const userIds = [
    ...new Set([...forms, ...people].map((f) => f.userId).filter((u): u is string => !!u)),
  ];
  const [steps, names] = await Promise.all([
    sessionIds.length
      ? db
          .select({ sessionId: e.sessionId, path: e.path, at: e.createdAt })
          .from(e)
          .where(and(inArray(e.sessionId, sessionIds), eq(e.kind, "view")))
          .orderBy(asc(e.createdAt))
      : [],
    userIds.length
      ? db
          .select({ id: users.id, name: users.displayName, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : [],
  ]);
  const nameOf = new Map(names.map((u) => [u.id, u.name || u.email || u.id]));

  const t = totals[0];
  return {
    days,
    totals: {
      views: Number(t?.views ?? 0),
      visitors: Number(t?.visitors ?? 0),
      sessions: Number(t?.sessions ?? 0),
      signedIn: Number(t?.signedIn ?? 0),
      avgTimeMs: t?.avgTimeMs == null ? null : Number(t.avgTimeMs),
      avgLoadMs: t?.avgLoadMs == null ? null : Number(t.avgLoadMs),
      forms: Number(t?.forms ?? 0),
    },
    pages: pages.map((p) => ({ ...p, views: Number(p.views) })),
    slow: slow.map((p) => ({ ...p, views: Number(p.views), avgLoadMs: Number(p.avgLoadMs) })),
    sources: sources.map((s) => ({ ...s, views: Number(s.views) })),
    devices: devices.map((d) => ({ ...d, views: Number(d.views) })),
    browsers: browsers.map((d) => ({ ...d, views: Number(d.views) })),
    countries: countries.map((d) => ({ ...d, views: Number(d.views) })),
    journeys: forms.map((f) => ({
      at: f.at,
      form: f.path,
      target: f.target,
      user: f.userId ? (nameOf.get(f.userId) ?? null) : null,
      steps: steps
        .filter((s) => s.sessionId === f.sessionId && s.at <= f.at)
        .map((s) => s.path)
        .slice(-8),
    })),
    people: people
      .filter((p): p is typeof p & { userId: string } => !!p.userId)
      .map((p) => ({
        userId: p.userId,
        name: nameOf.get(p.userId) ?? p.userId,
        views: Number(p.views),
        lastAt: p.lastAt,
      })),
  };
}

/** One signed-in user's recent way through the site, newest first. */
export async function userJourney(c: Context<AppEnv>, userId: string, limit = 200) {
  return c.var.db
    .select()
    .from(analyticsEvent)
    .where(eq(analyticsEvent.userId, userId))
    .orderBy(desc(analyticsEvent.createdAt))
    .limit(limit);
}
