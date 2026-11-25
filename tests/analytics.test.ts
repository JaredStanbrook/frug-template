import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

import app from "../worker/app";
import type { AppEnv } from "../worker/types";
import { analyticsEvent } from "../worker/schema/analytics.schema";
import { users } from "../worker/schema/auth.schema";
import {
  cleanPath,
  report,
  sourceOf,
  summariseUserAgent,
} from "../worker/services/analytics.service";
import { createRealDb } from "./utils/realDb";

/**
 * First-party analytics on a real (in-memory) database, because what matters
 * is the `where`: nothing recorded without performance consent, and a beacon
 * only ever touching its own session's rows.
 */

const PHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

let db: any;
let close: () => void;
let signedIn: { id: string } | null;

beforeEach(async () => {
  ({ db, close } = createRealDb());
  const [user] = await db
    .insert(users)
    .values({ email: "reader@example.com", displayName: "Reader", updatedAt: "2026-01-01" })
    .returning();
  signedIn = { id: user.id };
});
afterEach(() => close());

const testApp = () => {
  const wrapper = new Hono<AppEnv>();
  wrapper.use("*", async (c, next) => {
    c.set("db", db);
    c.set("app", {
      name: "Test",
      tagline: "",
      locale: "en-AU",
      currency: "AUD",
      timezone: "UTC",
      origin: "https://site.test",
    });
    c.set("auth", { user: signedIn, session: null } as any);
    await next();
  });
  wrapper.route("/", app);
  return wrapper;
};

const env = { KV: {}, DB: {}, ASSETS: {}, ORIGIN: "https://site.test" } as any;

const beacon = (body: unknown, cookie = "cookie_consent=1.010", ua = PHONE) =>
  testApp().fetch(
    new Request("https://site.test/api/analytics", {
      method: "POST",
      headers: { "content-type": "text/plain", cookie, "user-agent": ua },
      body: JSON.stringify(body),
    }),
    env,
  );

const cookiesSet = (res: Response) => res.headers.getSetCookie?.() ?? [];
const idCookies = (res: Response) =>
  cookiesSet(res)
    .filter((c) => /^_fa_(vid|sid)=[^;]+/.test(c) && !/Max-Age=0/.test(c))
    .map((c) => c.split(";")[0])
    .join("; ");

describe("analytics beacons", () => {
  it("records nothing without performance consent, and clears the ids", async () => {
    for (const consent of ["", "cookie_consent=1.101"]) {
      const res = await beacon({ type: "view", path: "/" }, consent);
      expect(res.status).toBe(204);
      expect(idCookies(res)).toBe("");
      expect(cookiesSet(res).some((c) => /^_fa_vid=;.*Max-Age=0/.test(c))).toBe(true);
    }
    expect(await db.select().from(analyticsEvent)).toHaveLength(0);
  });

  it("records a view with consent: clean path, source, device, linked account", async () => {
    signedIn = (await db.select().from(users))[0];
    const res = await beacon({
      type: "view",
      path: "/notes?q=secret#top",
      referrer: "https://www.example.org/post",
      loadMs: 840.4,
    });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: number };
    expect(idCookies(res)).toMatch(/_fa_vid=.+; _fa_sid=.+/);
    const [row] = await db.select().from(analyticsEvent);
    expect(row).toMatchObject({
      id,
      kind: "view",
      path: "/notes",
      source: "example.org",
      device: "mobile",
      browser: "Safari",
      os: "iOS",
      loadMs: 840,
      userId: signedIn!.id,
    });
  });

  it("keeps a visitor's ids across pages, and leaves accounts out when signed out", async () => {
    signedIn = null;
    const first = await beacon({ type: "view", path: "/" });
    const ids = idCookies(first);
    await beacon({ type: "view", path: "/login" }, `cookie_consent=1.010; ${ids}`);
    const rows = await db.select().from(analyticsEvent);
    expect(rows).toHaveLength(2);
    expect(rows[0].sessionId).toBe(rows[1].sessionId);
    expect(rows[0].visitorId).toBe(rows[1].visitorId);
    expect(rows.every((r: any) => r.userId === null)).toBe(true);
  });

  it("updates time on page only for the visitor's own session, keeping the longest", async () => {
    const view = await beacon({ type: "view", path: "/" });
    const { id } = (await view.json()) as { id: number };
    const mine = `cookie_consent=1.010; ${idCookies(view)}`;
    await beacon({ type: "time", id, timeOnPageMs: 12_000 }, mine);
    await beacon({ type: "time", id, timeOnPageMs: 5_000 }, mine);
    await beacon(
      { type: "time", id, timeOnPageMs: 99_000 },
      "cookie_consent=1.010; _fa_sid=someoneElseEntirely",
    );
    const [row] = await db.select().from(analyticsEvent);
    expect(row.timeOnPageMs).toBe(12_000);
  });

  it("records where a form went, never what was in it", async () => {
    const res = await beacon({
      type: "form",
      path: "/login",
      target: "/web/auth/login?x=1",
      email: "a@b.c",
    });
    expect(res.status).toBe(204);
    const [row] = await db.select().from(analyticsEvent);
    expect(row).toMatchObject({ kind: "form", path: "/login", target: "/web/auth/login" });
    expect(JSON.stringify(row)).not.toContain("a@b.c");
  });

  it("ignores bots, other sites' paths, and junk", async () => {
    await beacon({ type: "view", path: "/" }, "cookie_consent=1.010", "Googlebot/2.1");
    await beacon({ type: "view", path: "//evil.example/x" });
    await beacon({ type: "view", path: "https://evil.example/" });
    await beacon({ type: "view", path: "/admin/analytics" });
    expect((await beacon({ type: "nope" })).status).toBe(400);
    expect(await db.select().from(analyticsEvent)).toHaveLength(0);
  });

  it("drops the analytics ids when performance consent is withdrawn", async () => {
    const res = await testApp().fetch(
      new Request("https://site.test/cookies", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "HX-Request": "true" },
        body: "choice=reject",
      }),
      env,
    );
    const set = cookiesSet(res);
    expect(set.some((c) => /^_fa_vid=;.*Max-Age=0/.test(c))).toBe(true);
    expect(set.some((c) => /^_fa_sid=;.*Max-Age=0/.test(c))).toBe(true);
  });
});

describe("analytics report", () => {
  it("counts visitors and visits, and shows the pages before each form", async () => {
    const a = await beacon({ type: "view", path: "/" });
    const ids = `cookie_consent=1.010; ${idCookies(a)}`;
    await beacon({ type: "view", path: "/notes" }, ids);
    await beacon({ type: "form", path: "/notes", target: "/notes" }, ids);
    signedIn = null;
    await beacon({ type: "view", path: "/" });

    const c = { var: { db }, env: {} } as any;
    const r = await report(c, 30);
    expect(r.totals).toMatchObject({ views: 3, visitors: 2, sessions: 2, signedIn: 1, forms: 1 });
    expect(r.pages[0]).toMatchObject({ path: "/", views: 2 });
    expect(r.journeys[0].steps).toEqual(["/", "/notes"]);
    expect(r.journeys[0].user).toBe("Reader");
    expect(r.people[0]).toMatchObject({ name: "Reader", views: 2 });
  });
});

describe("analytics helpers", () => {
  it("boils a user agent down to device, browser and system", () => {
    expect(summariseUserAgent(PHONE)).toEqual({ device: "mobile", browser: "Safari", os: "iOS" });
    expect(
      summariseUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
      ),
    ).toEqual({ device: "desktop", browser: "Edge", os: "Windows" });
    expect(
      summariseUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Version/17.0 Safari/604.1")
        .device,
    ).toBe("tablet");
  });

  it("keeps only this site's paths, and other sites as sources", () => {
    expect(cleanPath("/a/b?c=1")).toBe("/a/b");
    expect(cleanPath("//x.example")).toBeNull();
    expect(cleanPath("http://x.example/")).toBeNull();
    expect(sourceOf("https://site.test/x", null, "site.test")).toBeNull();
    expect(sourceOf("https://news.example/x", null, "site.test")).toBe("news.example");
    expect(sourceOf("", "Newsletter", "site.test")).toBe("newsletter");
  });
});
