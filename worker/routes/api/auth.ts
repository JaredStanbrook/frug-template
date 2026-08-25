// worker/routes/auth.ts
import { Hono } from "hono";
import { z } from "zod";
import { csrf } from "hono/csrf";
import { zValidator } from "@hono/zod-validator";
import {
  loginUserSchema,
  registerUserSchema,
  registerPasskeyOptionsSchema,
  registerPasskeyVerifySchema,
  loginPasskeyOptionsSchema,
  loginPasskeyVerifySchema,
  safeUserSchema,
  updateUserProfileSchema,
  changePasswordRequestSchema,
  changePinRequestSchema,
  verifyTotpSchema,
} from "../../schema/auth.schema";
import type { AppEnv } from "../../types";

// --- Routes ---
export const passkey = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    // Middleware check
    const isMethodEnabled = c.get("isMethodEnabled");
    if (!isMethodEnabled("passkey")) {
      return c.json({ error: "Passkey auth is not enabled" }, 404);
    }
    await next();
  })

  // 1. Register Options
  .post("/register/options", zValidator("json", registerPasskeyOptionsSchema), async (c) => {
    try {
      const { email } = c.req.valid("json");
      const { auth } = c.var;

      const result = await auth.generatePasskeyRegistrationOptions(email);

      // Return options directly, challengeId is included in result
      return c.json({ ...result.options, challengeId: result.challengeId });
    } catch (e: any) {
      return c.json({ error: e.message || "Registration initialization failed" }, 400);
    }
  })

  // 2. Register Verify
  .post("/register/verify", zValidator("json", registerPasskeyVerifySchema), async (c) => {
    try {
      const { email, role, response, challengeId } = c.req.valid("json");
      const { auth } = c.var;

      const { user, requiresVerification, verified, sessionToken } =
        await auth.verifyPasskeyRegistration(email, role, response as any, challengeId);

      // Set Cookie
      await auth.createSession({ id: sessionToken.user.id, roles: sessionToken.user.roles });

      return c.json({ user, requiresVerification, verified });
    } catch (e: any) {
      console.error("Register Verify Error:", e);
      return c.json({ error: e.message || "Registration verification failed" }, 400);
    }
  })

  // 3. Login Options
  .post("/login/options", zValidator("json", loginPasskeyOptionsSchema), async (c) => {
    try {
      const { email } = c.req.valid("json");
      const { auth } = c.var;

      const result = await auth.generatePasskeyLoginOptions(email);

      return c.json({ ...result.options, challengeId: result.challengeId });
    } catch (e: any) {
      return c.json({ error: e.message || "Login initialization failed" }, 400);
    }
  })

  // 4. Login Verify
  .post("/login/verify", zValidator("json", loginPasskeyVerifySchema), async (c) => {
    try {
      const { email, response, challengeId } = c.req.valid("json");
      const { auth } = c.var;

      const { user } = await auth.verifyPasskeyLogin(email, response as any, challengeId);

      // Set Cookie
      await auth.createSession(user);

      return c.json(user);
    } catch (e: any) {
      console.error("Login Verify Error:", e);
      return c.json({ error: e.message || "Login verification failed" }, 400);
    }
  });

/**
 * TOTP setup
 */
export const totp = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    const isMethodEnabled = c.get("isMethodEnabled");
    if (!isMethodEnabled("totp")) {
      return c.json({ error: "TOTP is not enabled" }, 404);
    }
    await next();
  })
  .get("/setup", async (c) => {
    const { auth } = c.var;
    try {
      const result = await auth.setupTotp();
      return c.json(result);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  })
  .post("/enable", zValidator("json", verifyTotpSchema), async (c) => {
    const { auth } = c.var;
    const { secret, code } = c.req.valid("json");
    try {
      await auth.verifyAndEnableTotp(secret, code);
      return c.json({ message: "TOTP enabled successfully" });
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  })

  .delete("/disable", async (c) => {
    const { auth } = c.var;

    try {
      await auth.disableTotp();
      return c.json({ message: "TOTP disabled successfully" });
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  });

export const apiAuth = new Hono<AppEnv>()
  .use(
    "*",
    csrf({
      // Same-origin, plus localhost for development. Compare exactly — a
      // prefix or regex match here lets `https://evil-example.com` through
      // when ORIGIN is `https://example.com`.
      origin: (origin, c) => {
        if (origin === new URL(c.req.url).origin) return true;
        if (origin === c.env.ORIGIN) return true;
        try {
          const { hostname, protocol } = new URL(origin);
          return protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1");
        } catch {
          return false;
        }
      },
    }),
  )
  .route("/passkey", passkey)
  .route("/totp", totp)
  .get("/methods", (c) => {
    const { authConfig } = c.var;

    const publicRoles = authConfig.roles.available.filter(
      (role) => !authConfig.roles.restricted.includes(role),
    );

    return c.json({
      methods: Array.from(authConfig.methods),
      requireEmailVerification: authConfig.security.requireEmailVerification,
      requirePhoneVerification: authConfig.security.requirePhoneVerification,

      roles: publicRoles,
      defaultRole: authConfig.roles.default,
    });
  })
  .post("/register", zValidator("json", registerUserSchema), async (c) => {
    const { auth } = c.var;
    const body = c.req.valid("json");

    try {
      const result = await auth.register(body);
      await auth.createSession({ id: result.user.id, roles: result.user.roles });
      return c.json(result, 201);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  })

  .post("/login", zValidator("json", loginUserSchema), async (c) => {
    const { auth } = c.var;
    const body = await c.req.valid("json");

    const isMethodEnabled = c.get("isMethodEnabled");

    try {
      let result;
      if (body.password && isMethodEnabled("password")) {
        result = await auth.loginWithPassword(body.email, body.password, body.totpCode);
      } else if (body.pin && isMethodEnabled("pin")) {
        result = await auth.loginWithPin(body.email, body.pin);
      } else if (body.totpCode && isMethodEnabled("totp")) {
        result = await auth.loginWithTotp(body.email, body.totpCode);
      } else {
        return c.json({ error: "Invalid authentication method" }, 400);
      }

      await auth.createSession(result.user);

      return c.json(result.user);
    } catch (error: any) {
      if (error.message === "TOTP_REQUIRED") {
        return c.json({ requireTotp: true }, 403);
      }
      return c.json({ error: error.message }, 401);
    }
  })
  .get("/me", (c) => {
    const user = c.var.auth.user;
    if (!user) {
      return c.json({ error: "You are not logged in." }, 401);
    }

    const cleanUser = safeUserSchema.parse(user);
    return c.json(cleanUser);
  })
  .patch("/me", zValidator("json", updateUserProfileSchema), async (c) => {
    const user = c.var.auth.user;
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const payload = c.req.valid("json");
    const { auth } = c.var;

    try {
      await auth.updateProfile(user.id, payload);
      return c.json({ success: true, user: auth.user });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  })
  .delete("/me", async (c) => {
    const user = c.var.auth.user;
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { auth } = c.var;

    try {
      await auth.deleteAccount(user.id);

      auth.destroySession();

      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  })
  .post("/change-password", zValidator("json", changePasswordRequestSchema), async (c) => {
    const user = c.var.auth.user;
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const payload = c.req.valid("json");
    const { auth } = c.var;

    try {
      await auth.changePassword(user.id, payload);
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  })
  .post("/change-pin", zValidator("json", changePinRequestSchema), async (c) => {
    const user = c.var.auth.user;
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const payload = c.req.valid("json");
    const { auth } = c.var;

    try {
      await auth.changePin(user.id, payload);
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  })

  .post("/logout", async (c) => {
    try {
      const { auth } = c.var;
      auth.destroySession();
      return c.json({ success: true });
    } catch (e) {
      console.error("Logout error", e);
      return c.json({ error: "Failed to log out." }, 500);
    }
  })
  /**
   * Auth logs (admin/security monitoring)
   */
  .get("/logs", zValidator("query", z.object({})), async (c) => {
    //zValidator("query", queryAuthLogsSchema),
    const { auth } = c.var;
    const query = c.req.valid("query");

    try {
      const logs = await auth.getAuthLogs(query);
      return c.json({ logs });
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  });
