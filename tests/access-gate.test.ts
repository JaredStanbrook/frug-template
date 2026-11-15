import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";

import app from "../worker/app";
import type { AppEnv } from "../worker/types";
import { accessLink } from "../worker/schema/access.schema";
import { openLink, linkState, gateMode } from "../worker/services/access-gate.service";
import { createRealDb } from "./utils/realDb";

/**
 * The access gate, against a real database: every claim here is about which
 * row a `where` matched, which the fake db cannot answer.
 */

const HOUR = 3_600_000;
let db: any;

const makeApp = (user: any = null) => {
  const wrapper = new Hono<AppEnv>();
  wrapper.use("*", async (c, next) => {
    c.set("db", db);
    c.set("app", {
      name: "Test App",
      tagline: "Testing",
      locale: "en-AU",
      currency: "AUD",
      timezone: "UTC",
      origin: "http://localhost:3000",
    });
    c.set("authConfig", { methods: new Set(["password"]) } as any);
    c.set("auth", { user, isRegistrationOpen: async () => false } as any);
    c.set("isMethodEnabled", () => true);
    await next();
  });
  wrapper.route("/", app);
  return wrapper;
};

const fetchAs = (path: string, { gate = "session", cookie = "", user = null as any } = {}) =>
  makeApp(user).fetch(new Request(`http://localhost${path}`, { headers: { cookie } }), {
    ASSETS: {},
    ACCESS_GATE: gate,
  } as any);

/** Open a link the way a browser does: POST from the Continue button. */
const openAsBrowser = (token: string, gate = "session") =>
  makeApp().fetch(new Request(`http://localhost/a/${token}`, { method: "POST" }), {
    ASSETS: {},
    ACCESS_GATE: gate,
  } as any);

const cookieFrom = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];

const addLink = async (token: string, over: Record<string, unknown> = {}) =>
  db
    .insert(accessLink)
    .values({ token, label: "Alex", durationHours: 24, updatedAt: "x", ...over });

beforeEach(() => {
  db = createRealDb().db;
});

describe("gate mode", () => {
  it('is off unless the var names a mode, and reads the old "true" as session', () => {
    expect(gateMode({})).toBe("off");
    expect(gateMode({ ACCESS_GATE: "false" })).toBe("off");
    expect(gateMode({ ACCESS_GATE: "yes" })).toBe("off");
    expect(gateMode({ ACCESS_GATE: "true" })).toBe("session");
    expect(gateMode({ ACCESS_GATE: "Session" })).toBe("session");
    expect(gateMode({ ACCESS_GATE: "link" })).toBe("link");
  });
});

describe("session mode", () => {
  it("opens once: starts the clock, mints a session token, refuses a second", async () => {
    await addLink("tok");
    const [created] = await db.select().from(accessLink);
    expect(linkState(created)).toBe("unused");

    const first = new Date("2026-01-01T00:00:00Z");
    const opened = await openLink(db, "tok", "session", first);
    expect(opened!.link.firstVisitedAt).toBe(first.toISOString());
    expect(opened!.link.expiresAt).toBe(new Date(first.getTime() + 24 * HOUR).toISOString());
    expect(opened!.cookie).toBe(opened!.link.sessionToken);
    expect(opened!.cookie).not.toBe("tok");
    expect(linkState(opened!.link, new Date(first.getTime() + HOUR))).toBe("active");
    expect(linkState(opened!.link, new Date(first.getTime() + 25 * HOUR))).toBe("expired");

    expect(await openLink(db, "tok", "session", new Date(first.getTime() + 2 * HOUR))).toBeNull();
  });

  it("lets a visitor in through a link, and out again once it expires", async () => {
    await addLink("good");
    const open = await openAsBrowser("good");
    expect(open.headers.get("location")).toBe("/");
    const cookie = cookieFrom(open);
    expect(cookie).toMatch(/^site_access=[0-9a-f-]{72}$/);

    expect((await fetchAs("/", { cookie })).status).toBe(200);

    // The link itself is spent, and the raw token is not a cookie.
    expect((await openAsBrowser("good")).headers.get("location")).toBe("/gone");
    expect((await fetchAs("/", { cookie: "site_access=good" })).headers.get("location")).toBe(
      "/gone",
    );

    await db.update(accessLink).set({ expiresAt: "2000-01-01T00:00:00.000Z" });
    expect((await fetchAs("/", { cookie })).headers.get("location")).toBe("/gone");
  });
});

describe("link mode", () => {
  it("keeps working for every opener until it expires, with no session token", async () => {
    await addLink("tok");
    const first = new Date("2026-01-01T00:00:00Z");

    const a = await openLink(db, "tok", "link", first);
    expect(a!.cookie).toBe("tok");
    expect(a!.link.sessionToken).toBeNull();

    // A second opener does not restart the clock.
    const b = await openLink(db, "tok", "link", new Date(first.getTime() + 2 * HOUR));
    expect(b!.cookie).toBe("tok");
    expect(b!.link.expiresAt).toBe(a!.link.expiresAt);

    expect(await openLink(db, "tok", "link", new Date(first.getTime() + 25 * HOUR))).toBeNull();
  });

  it("lets two browsers in on one link, and shuts both out on revoke", async () => {
    await addLink("shared");
    const one = cookieFrom(await openAsBrowser("shared", "link"));
    const two = cookieFrom(await openAsBrowser("shared", "link"));
    expect(one).toBe("site_access=shared");
    expect(two).toBe(one);
    expect((await fetchAs("/", { gate: "link", cookie: one })).status).toBe(200);

    await db.update(accessLink).set({ revokedAt: "2026-01-01T00:00:00Z" });
    expect((await fetchAs("/", { gate: "link", cookie: one })).headers.get("location")).toBe(
      "/gone",
    );
    expect((await openAsBrowser("shared", "link")).headers.get("location")).toBe("/gone");
  });
});

describe("the gate", () => {
  for (const gate of ["session", "link"]) {
    it(`${gate}: sends a visitor without a link to /gone, keeps sign-in open`, async () => {
      for (const path of ["/", "/notes", "/profile"]) {
        const res = await fetchAs(path, { gate });
        expect(res.headers.get("location"), path).toBe("/gone");
      }
      for (const path of ["/gone", "/login", "/a/whatever"]) {
        expect((await fetchAs(path, { gate })).status, path).toBe(200);
      }
    });
  }

  it("does not open a link on a GET, so chat previews leave it for the recipient", async () => {
    await addLink("good");
    const preview = await fetchAs("/a/good");
    expect(preview.status).toBe(200);
    expect(preview.headers.get("set-cookie")).toBeNull();
    const [link] = await db.select().from(accessLink);
    expect(link.firstVisitedAt).toBeNull();
    expect((await openAsBrowser("good")).headers.get("location")).toBe("/");
  });

  it("refuses an unknown or revoked token", async () => {
    expect((await openAsBrowser("nope")).headers.get("location")).toBe("/gone");
    await addLink("rev", { revokedAt: "2026-01-01T00:00:00Z" });
    expect((await openAsBrowser("rev")).headers.get("location")).toBe("/gone");
    const [link] = await db.select().from(accessLink);
    expect(link.firstVisitedAt).toBeNull();
  });

  it("lets an admin see everything", async () => {
    const admin = { id: "u1", roles: ["admin"], permissions: [] };
    expect((await fetchAs("/", { user: admin })).status).toBe(200);
    expect((await fetchAs("/admin/access", { user: admin })).status).toBe(200);
  });

  it("shows a locked-out visitor no nav and no tagline", async () => {
    for (const path of ["/gone", "/login"]) {
      const html = await (await fetchAs(path)).text();
      expect(html, path).not.toContain("Testing");
      expect(html, path).not.toContain("<nav");
    }
  });

  it("asks crawlers to stay out and lists no pages while locked", async () => {
    const robots = await (await fetchAs("/robots.txt")).text();
    expect(robots).toContain("Disallow: /\n");
    expect(robots).not.toContain("Sitemap:");
    expect((await fetchAs("/sitemap.xml")).status).toBe(404);
  });

  it('is open when ACCESS_GATE is "off"', async () => {
    expect((await fetchAs("/", { gate: "off" })).status).toBe(200);
    expect((await fetchAs("/a/anything", { gate: "off" })).headers.get("location")).toBe("/");
  });
});
