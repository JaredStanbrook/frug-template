import { describe, it, expect } from "vitest";
import { Hono } from "hono";

import { requireSecrets } from "../worker/middleware/secrets.middleware";
import { parseAuthConfig, validateAuthConfig } from "../worker/config/auth.config";
import type { AppEnv } from "../worker/types";

/**
 * The guard that refuses to serve without JWT_SECRET.
 *
 * This exists because of a specific, memorable failure: with the secret
 * missing, a *wrong* password produced a correct error page and the *right*
 * one produced an opaque 500. `setSignedCookie` throws on an undefined
 * secret, and only the success path sets a cookie — so the single working
 * path was the only one that broke. It read as "sign-in is rejecting a valid
 * credential", which sends you hunting through the hashing code, several
 * layers away from the actual cause.
 *
 * Failing closed turns that into one obvious message. These tests hold the
 * guard to being unmissable: every route, the right status, no caching, and
 * wording that names the exact setting — including the distinction between a
 * Secret and a *Build* variable, which is the trap that produced the outage
 * in the first place.
 */

const buildApp = () => {
  const app = new Hono<AppEnv>();
  app.use("*", requireSecrets);
  app.get("/", (c) => c.text("home"));
  app.get("/login", (c) => c.text("login"));
  app.post("/api/notes", (c) => c.text("created", 201));
  return app;
};

const get = (env: Record<string, unknown>, path = "/", init?: RequestInit) =>
  buildApp().fetch(new Request(`http://localhost${path}`, init), env as any);

describe("requireSecrets", () => {
  it("refuses every route when JWT_SECRET is missing", async () => {
    for (const [path, init] of [
      ["/", undefined],
      ["/login", undefined],
      ["/api/notes", { method: "POST" }],
    ] as const) {
      const res = await get({}, path, init);
      expect(res.status, `${init?.method ?? "GET"} ${path}`).toBe(503);
    }
  });

  it("treats an empty string as missing", async () => {
    // Wrangler hands back "" for a variable that was declared but never given
    // a value, which is exactly as unusable as an absent one.
    const res = await get({ JWT_SECRET: "" });
    expect(res.status).toBe(503);
  });

  it("names the fix, and the Build-variable trap specifically", async () => {
    const html = await (await get({})).text();

    expect(html).toContain("JWT_SECRET");
    expect(html).toContain("Secret");
    // The failure that cost the most time: JWT_SECRET set as a *Build*
    // variable looks set in the dashboard and is undefined at runtime.
    expect(html).toContain("Build");
    expect(html).toContain("Variables and Secrets");
  });

  it("is not indexable or cacheable", async () => {
    const res = await get({});

    // A 503 pinned in any cache outlives the fix it is telling you to make.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toContain('name="robots" content="noindex"');
  });

  it("serves normally once the secret is set", async () => {
    const res = await get({ JWT_SECRET: "a-real-secret" });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("home");
  });
});

describe("auth config", () => {
  const env = { AUTH_METHODS: "password" };

  it("reports a missing JWT_SECRET as a config error", () => {
    const result = validateAuthConfig(env);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("JWT_SECRET");
  });

  /**
   * This used to read `env.JWT_SECRET || "default"`. Signing admin sessions
   * with a literal that ships in the template's public source means anyone
   * holding the source can mint a valid session — and nothing anywhere would
   * look wrong. An empty secret is caught; a plausible-looking one is not.
   */
  it("never substitutes a default secret", () => {
    const config = parseAuthConfig(env);

    expect(config.security.jwtSecret).toBe("");
  });

  it("passes once the secret is set", () => {
    expect(validateAuthConfig({ ...env, JWT_SECRET: "a-real-secret" }).valid).toBe(true);
  });
});

describe("session configuration", () => {
  const base = { AUTH_METHODS: "password", JWT_SECRET: "a-real-secret" };

  /**
   * SESSION_DURATION is milliseconds and the JWT_EXPIRY beside it is seconds,
   * so a value copied into the wrong one is a valid integer that signs every
   * user out seconds after they arrive. Nothing downstream can tell that from
   * a deliberate choice, and the symptom — "it keeps logging me out" — points
   * nowhere near the cause.
   */
  it("catches a session duration given in seconds", () => {
    const result = validateAuthConfig({ ...base, SESSION_DURATION: "86400" });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("SESSION_DURATION");
  });

  it("accepts a duration in milliseconds", () => {
    expect(validateAuthConfig({ ...base, SESSION_DURATION: "86400000" }).valid).toBe(true);
  });

  it("catches a renewal threshold longer than the session itself", () => {
    const result = validateAuthConfig({
      ...base,
      SESSION_DURATION: "3600000",
      SESSION_RENEWAL_THRESHOLD: "7200000",
    });

    // Renewing on every use means the session never ends, which is the
    // opposite of what setting a duration was meant to do.
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("SESSION_RENEWAL_THRESHOLD");
  });
});
