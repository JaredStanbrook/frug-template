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
  origin: "http://localhost:3000",
});

const createAuthConfig = (): AuthConfig => ({
  methods: new Set(["password"]),
  session: { duration: 1000, renewalThreshold: 500, maxSessions: 5 },
  security: {
    maxFailedAttempts: 5,
    lockoutDuration: 300,
    requireEmailVerification: false,
    requirePhoneVerification: false,
    allowedEmails: [],
    jwtSecret: "test",
    jwtExpiry: 3600,
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

const createTestApp = (user: any | null) => {
  const fakeDb = createFakeDb(createMockData());

  const wrapper = new Hono<AppEnv>();
  wrapper.use("*", async (c, next) => {
    c.set("db", fakeDb as any);
    c.set("app", createAppConfig());
    c.set("authConfig", createAuthConfig());
    c.set("auth", { user, session: user ? { id: user.id } : null, destroySession() {} } as any);
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

    for (const path of ["/", "/login", "/register"]) {
      const res = await get(testApp, path);
      expect(res.status, `GET ${path}`).toBe(200);
    }
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

    for (const path of ["/", "/profile", "/notes", "/notes/new", "/notes/1/edit", "/admin/logs"]) {
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
