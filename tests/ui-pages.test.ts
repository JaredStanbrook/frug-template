import { describe, it, expect } from "vitest";
import { Hono } from "hono";

import app from "../worker/app";
import type { AppEnv } from "../worker/types";
import type { AppConfig } from "../worker/config/app.config";
import type { AuthConfig } from "../worker/config/auth.config";
import { createFakeDb, createMockData } from "./utils/fakeDb";

/**
 * Smoke tests: every route renders without throwing, signed out and signed in.
 *
 * They exist to catch the failure this template makes easy — a view importing
 * something a route no longer provides. They are not a substitute for testing
 * your own feature logic.
 */

const createAppConfig = (): AppConfig => ({
  name: "Test App",
  tagline: "Testing",
  locale: "en-AU",
  currency: "AUD",
  timezone: "UTC",
  origin: "http://localhost:3000",
});

const createAuthConfig = (
  methods: string[] = ["password"],
  requireEmailVerification = false,
): AuthConfig => ({
  methods: new Set(methods as any),
  session: { duration: 1000, renewalThreshold: 500, maxSessions: 5 },
  security: {
    maxFailedAttempts: 5,
    lockoutDuration: 300,
    requireEmailVerification,
    requirePhoneVerification: false,
    allowedEmails: [],
    jwtSecret: "test",
    jwtExpiry: 3600,
    hashIterations: 1000,
  },
  roles: {
    available: ["user", "admin"],
    default: "user",
    restricted: ["admin"],
    inherent: {},
  },
  permissions: { available: [] },
  password: {
    minLength: 8,
    requireUppercase: false,
    requireLowercase: false,
    requireNumbers: false,
    requireSpecialChars: false,
  },
});

/**
 * `methods` is worth varying: the auth pages hide their tab strip entirely
 * when only one method is enabled, so a single-method config never renders
 * roughly half of those screens.
 */
const createTestApp = (
  user: any | null,
  methods?: string[],
  registrationOpen = true,
  requireEmailVerification = false,
) => {
  const fakeDb = createFakeDb(createMockData());

  const wrapper = new Hono<AppEnv>();
  wrapper.use("*", async (c, next) => {
    c.set("db", fakeDb as any);
    c.set("app", createAppConfig());
    c.set("authConfig", createAuthConfig(methods, requireEmailVerification));
    c.set("auth", {
      user,
      session: user ? { id: user.id } : null,
      destroySession() {},
      isRegistrationOpen: async () => registrationOpen,
    } as any);
    c.set("isMethodEnabled", () => true);
    await next();
  });

  wrapper.route("/", app);
  return wrapper;
};

const env = {
  KV: {},
  DB: {},
  ASSETS: {},
  APP_NAME: "Test App",
  ORIGIN: "http://localhost:3000",
} as any;

const get = (testApp: Hono<AppEnv>, path: string) =>
  testApp.fetch(new Request(`http://localhost${path}`), env);

describe("UI pages load", () => {
  it("serves public pages to signed-out visitors", async () => {
    const testApp = createTestApp(null);

    for (const path of [
      "/",
      "/login",
      "/register",
      "/cookies",
      "/forgot-password",
      "/reset-password?token=abc",
      "/verify-email?token=abc",
    ]) {
      const res = await get(testApp, path);
      expect(res.status, `GET ${path}`).toBe(200);
    }
  });

  it("closes /register and hides its link once sign-up is closed", async () => {
    const closed = createTestApp(null, undefined, false);

    const res = await get(closed, "/register");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");

    // The sign-in card stops offering it. (The nav's "Get Started" link does
    // not know; it lands on /register, which redirects here.)
    const login = await (await get(closed, "/login")).text();
    expect(login).not.toContain("have an account?");

    // Open by default: the prompt is there on an ordinary site.
    const open = await (await get(createTestApp(null), "/login")).text();
    expect(open).toContain("have an account?");
  });

  it("keeps emailed tokens out of the Referer, and asks before confirming", async () => {
    const testApp = createTestApp(null);
    for (const path of ["/reset-password?token=abc", "/verify-email?token=abc"]) {
      const res = await get(testApp, path);
      expect(res.headers.get("referrer-policy"), path).toBe("no-referrer");
    }
    // A mail scanner opening the link must not confirm anything: a button does.
    const html = await (await get(testApp, "/verify-email?token=abc")).text();
    expect(html).toContain('hx-post="/verify-email"');
  });

  it("offers a password reset only where email can be sent", async () => {
    // The test env's ORIGIN is localhost, where emails are printed instead.
    const local = await (await get(createTestApp(null), "/login")).text();
    expect(local).toContain("/forgot-password");

    const res = await createTestApp(null).fetch(new Request("http://localhost/login"), {
      ...env,
      ORIGIN: "https://site.test",
    });
    expect(await res.text()).not.toContain("/forgot-password");
  });

  it("holds an unconfirmed user at /verify-email when confirmation is required", async () => {
    const unconfirmed = { ...createMockData().users[0], emailVerified: false };
    const strict = createTestApp(unconfirmed, undefined, true, true);

    for (const path of ["/profile", "/notes", "/admin/logs"]) {
      const res = await get(strict, path);
      expect(res.status, path).toBe(302);
      expect(res.headers.get("location"), path).toBe("/verify-email");
    }
    // The page itself is reachable, or nobody could ever get past it.
    const page = await get(strict, "/verify-email");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Send the link again");

    // Off by default: the same user goes straight in.
    expect((await get(createTestApp(unconfirmed), "/profile")).status).toBe(200);
  });

  it("carries ?next= between sign-in and sign-up, and honours it once signed in", async () => {
    const login = await (await get(createTestApp(null), "/login?next=%2Fnotes")).text();
    expect(login).toContain('href="/register?next=%2Fnotes"');
    const register = await (await get(createTestApp(null), "/register?next=%2Fnotes")).text();
    expect(register).toContain('href="/login?next=%2Fnotes"');

    const signedIn = createTestApp(createMockData().users[0]);
    const back = await get(signedIn, "/login?next=%2Fnotes");
    expect(back.headers.get("location")).toBe("/notes");
    const away = await get(signedIn, "/login?next=%2F%2Fevil.example");
    expect(away.headers.get("location")).toBe("/");
  });

  /**
   * The sign-in and sign-up forms are sent by their islands, which call the
   * API. Submitted before the island has loaded, the browser sends the form
   * itself — and a form with no method is a GET, which put the password in
   * the address bar, the history and the server's logs.
   */
  it("never sends a form holding credentials by GET", async () => {
    const pages: [Hono<AppEnv>, string][] = [
      [createTestApp(null), "/login"],
      [createTestApp(null), "/register"],
      [createTestApp(null, ["password", "pin", "passkey"]), "/login"],
      [createTestApp(null, ["password", "pin", "passkey"]), "/register"],
      [createTestApp(null), "/forgot-password"],
      [createTestApp(null), "/reset-password?token=abc"],
    ];
    let checked = 0;
    for (const [testApp, path] of pages) {
      const html = await (await get(testApp, path)).text();
      for (const chunk of html.split("<form").slice(1)) {
        const openingTag = chunk.slice(0, chunk.indexOf(">"));
        const body = chunk.slice(0, chunk.indexOf("</form>"));
        if (!/type="password"|type="email"|name="pin"/.test(body)) continue;
        checked++;
        expect(openingTag, `a form on ${path}`).toMatch(/method="post"/);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("sends a form posted before its script loaded back to try again, unread", async () => {
    for (const page of ["/login", "/register"]) {
      const res = await createTestApp(null).fetch(
        new Request(`http://localhost${page}?next=%2Fnotes`, {
          method: "POST",
          body: new URLSearchParams({ email: "a@example.com", password: "Secret-pass-123" }),
        }),
        env,
      );
      expect(res.status, page).toBe(303);
      expect(res.headers.get("location"), page).toBe(`${page}?next=%2Fnotes`);
      expect(res.headers.get("set-cookie") ?? "", page).toContain("flash-toast");
    }
  });

  it("does not offer a restricted role on the sign-up form", async () => {
    const html = await (await get(createTestApp(null), "/register")).text();
    expect(html).not.toMatch(/<option[^>]*value="admin"/);
  });

  it("redirects signed-out visitors away from protected pages", async () => {
    const testApp = createTestApp(null);

    for (const path of ["/profile", "/notes", "/admin/logs"]) {
      const res = await get(testApp, path);
      expect(res.status, `GET ${path}`).toBe(302);
      expect(res.headers.get("location"), `GET ${path}`).toBe("/login");
    }
  });

  it("serves protected pages to a signed-in admin", async () => {
    const testApp = createTestApp(createMockData().users[0]);

    for (const path of [
      "/",
      "/profile",
      "/notes",
      "/notes/new",
      "/notes/1/edit",
      "/admin/logs",
      "/admin/analytics",
    ]) {
      const res = await get(testApp, path);
      expect(res.status, `GET ${path}`).toBe(200);
    }
  });

  it("serves the notes list with search and filter params", async () => {
    const testApp = createTestApp(createMockData().users[0]);

    // A literal % must not be treated as a LIKE wildcard, and an unknown
    // accent must not break rendering — both are easy to regress.
    for (const path of [
      "/notes?q=first",
      "/notes?q=100%25",
      "/notes?pinned=1",
      "/notes?q=x&pinned=1",
    ]) {
      const res = await get(testApp, path);
      expect(res.status, `GET ${path}`).toBe(200);
    }
  });

  /**
   * `class="grid-cols-${n}"` in a plain JSX attribute is not interpolation —
   * it is the literal text, emitted straight into the markup. Tailwind builds
   * classes by scanning source for complete names, so it never makes that one
   * and the rule silently does nothing. Both auth pages shipped this way and
   * their tab strips stacked vertically instead of sitting in a row.
   *
   * The same text inside a Lit `html` template is real interpolation and is
   * fine, which is why this checks the rendered output rather than the source:
   * a `${...}` reaching the browser is unambiguous, wherever it came from.
   *
   * Write the whole class name, or map a value to complete names — see
   * `gridColsFor` in worker/views/pages/authParts.tsx.
   */
  it("renders no unevaluated template interpolation", async () => {
    const signedOut = createTestApp(null);
    const signedIn = createTestApp(createMockData().users[0]);
    // The tab strip — where this bug lives — only exists with >1 method.
    const multiMethod = createTestApp(null, ["password", "pin", "passkey"]);

    const pages: [Hono<AppEnv>, string][] = [
      [signedOut, "/"],
      [signedOut, "/login"],
      [signedOut, "/register"],
      [multiMethod, "/login"],
      [multiMethod, "/register"],
      [signedIn, "/profile"],
      [signedIn, "/notes"],
      [signedIn, "/notes/new"],
      [signedIn, "/admin/logs"],
      [signedOut, "/forgot-password"],
      [signedOut, "/reset-password?token=abc"],
      [signedOut, "/verify-email?token=abc"],
    ];

    for (const [testApp, path] of pages) {
      const html = await (await get(testApp, path)).text();
      const leaked = html.match(/\$\{[^}]{0,60}\}/g) ?? [];
      expect(leaked, `GET ${path} leaked an uninterpolated expression`).toEqual([]);
    }
  });

  /**
   * Not every auth method is a tab. `totp` is a second step after a successful
   * sign-in, never a choice on this screen — so "password,passkey,totp" draws
   * two tabs, and "password,totp" draws one, which is no choice at all.
   *
   * Sizing the strip by the number of enabled methods therefore left an empty
   * column, and showed a one-tab strip. Count what renders.
   */
  it("sizes the auth tab strip by the tabs it actually renders", async () => {
    const tabsFor = async (methods: string[], path: string) => {
      const html = await (await get(createTestApp(null, methods), path)).text();
      const strip = html.match(/<div[^>]*slot="tabs"[^>]*>/)?.[0];
      return { strip, tabs: (html.match(/data-tab="/g) ?? []).length };
    };

    for (const path of ["/login", "/register"]) {
      const three = await tabsFor(["password", "pin", "passkey"], path);
      expect(three.tabs, `${path} with three tabs`).toBe(3);
      expect(three.strip, `${path} with three tabs`).toContain("grid-cols-3");

      // totp is enabled but is not a tab, so this is a two-tab strip.
      const two = await tabsFor(["password", "passkey", "totp"], path);
      expect(two.tabs, `${path} with totp enabled`).toBe(2);
      expect(two.strip, `${path} with totp enabled`).toContain("grid-cols-2");

      // One real choice is no choice — no strip at all.
      const one = await tabsFor(["password", "totp"], path);
      expect(one.tabs, `${path} with one real method`).toBe(0);
      expect(one.strip, `${path} with one real method`).toBeUndefined();
    }
  });

  it("returns only the grid fragment when HTMX targets it", async () => {
    const testApp = createTestApp(createMockData().users[0]);

    const res = await testApp.fetch(
      new Request("http://localhost/notes?q=first", {
        headers: { "HX-Request": "true", "HX-Target": "note-grid" },
      }),
      env,
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('id="note-grid"');
    // A fragment, not a page — hx-boost navigations still get the full layout.
    expect(html).not.toContain("<!DOCTYPE html>");
    expect(html).not.toContain("<title>");
  });
});
