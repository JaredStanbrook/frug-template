import { describe, it, expect } from "vitest";
import { Hono } from "hono";

import app from "../worker/app";
import type { AppEnv } from "../worker/types";
import { parseConsent, serializeConsent } from "../worker/lib/consent";
import { offeredCategories } from "../worker/config/cookies.config";
import { createFakeDb, createMockData } from "./utils/fakeDb";

/**
 * The cookie banner and preferences: shown until a choice is made, saved
 * exactly as chosen, and never allowing a category the site does not offer.
 */

const testApp = () => {
  const wrapper = new Hono<AppEnv>();
  wrapper.use("*", async (c, next) => {
    c.set("db", createFakeDb(createMockData()) as any);
    c.set("app", {
      name: "Test App",
      tagline: "Testing",
      locale: "en-AU",
      currency: "AUD",
      timezone: "UTC",
      origin: "http://localhost",
    });
    c.set("auth", {
      user: null,
      session: null,
      destroySession() {},
      isRegistrationOpen: async () => true,
    } as any);
    c.set("isMethodEnabled", () => true);
    await next();
  });
  wrapper.route("/", app);
  return wrapper;
};

const env = (vars: Record<string, string> = {}) =>
  ({
    KV: {},
    DB: {},
    ASSETS: {},
    APP_NAME: "Test App",
    ORIGIN: "http://localhost",
    ...vars,
  }) as any;

const get = (path: string, cookie = "", vars?: Record<string, string>) =>
  testApp().fetch(new Request(`http://localhost${path}`, { headers: { cookie } }), env(vars));

const post = (
  fields: Record<string, string>,
  headers: Record<string, string> = {},
  vars?: Record<string, string>,
) =>
  testApp().fetch(
    new Request("http://localhost/cookies", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      body: new URLSearchParams(fields).toString(),
    }),
    env(vars),
  );

const consentSet = (res: Response) =>
  res.headers.get("set-cookie")?.match(/cookie_consent=([^;]+)/)?.[1];

describe("cookie consent", () => {
  it("shows the banner until a choice is made, and the dialog always", async () => {
    const first = await (await get("/")).text();
    expect(first).toContain("Accept all cookies");
    expect(first).toContain("Reject all");
    expect(first).toContain('id="cookie-preferences"');
    expect(first).toContain("window.cookieConsent");

    const later = await (await get("/", "cookie_consent=1.100")).text();
    expect(later).not.toContain("Accept all cookies");
    expect(later).toContain('id="cookie-preferences"');
    expect(later).toMatch(/name="functional" value="on" checked/);
    expect(later).not.toMatch(/name="performance" value="on" checked/);
  });

  it("saves accept, reject and a custom choice", async () => {
    const hx = { "HX-Request": "true" };
    expect(consentSet(await post({ choice: "accept" }, hx))).toBe("1.111");
    expect(consentSet(await post({ choice: "reject" }, hx))).toBe("1.000");
    const custom = await post({ choice: "custom", functional: "on" }, hx);
    expect(consentSet(custom)).toBe("1.100");
    // HTMX gets the block back without the banner.
    const body = await custom.text();
    expect(body).toContain('id="cookie-consent"');
    expect(body).not.toContain("Accept all cookies");
  });

  it("never allows a category the site does not offer", async () => {
    const vars = { COOKIE_CATEGORIES: "functional" };
    const hx = { "HX-Request": "true" };
    expect(consentSet(await post({ choice: "accept" }, hx, vars))).toBe("1.100");
    expect(
      consentSet(await post({ choice: "custom", targeting: "on", functional: "on" }, hx, vars)),
    ).toBe("1.100");
  });

  it("without JavaScript, goes back to the page on this site, never elsewhere", async () => {
    const home = await post({ choice: "reject" }, { Referer: "http://localhost/notes" });
    expect(home.status).toBe(303);
    expect(home.headers.get("location")).toBe("http://localhost/notes");
    const away = await post({ choice: "reject" }, { Referer: "https://evil.example/x" });
    expect(away.headers.get("location")).toBe("/");
  });

  it("shows no banner when the site sets only necessary cookies", async () => {
    const html = await (await get("/", "", { COOKIE_CATEGORIES: "" })).text();
    expect(html).not.toContain("Accept all cookies");
    expect(html).not.toContain('id="cookie-preferences"');
    expect(offeredCategories({ COOKIE_CATEGORIES: "" })).toEqual([]);
    expect(offeredCategories({})).toEqual(["functional", "performance", "targeting"]);
  });

  it("lists every cookie on the policy page", async () => {
    const html = await (await get("/cookies")).text();
    for (const name of ["auth_token", "cookie_consent", "vite-ui-theme"])
      expect(html).toContain(name);
    expect(html).toContain("Strictly necessary");
  });

  it("reads only well-formed consent", () => {
    expect(parseConsent("1.101")).toEqual({
      functional: true,
      performance: false,
      targeting: true,
    });
    for (const bad of [undefined, "", "1.1", "2.111", "1.1x1", "yes"])
      expect(parseConsent(bad)).toBeNull();
    expect(serializeConsent({ functional: false, performance: true, targeting: false })).toBe(
      "1.010",
    );
  });
});
