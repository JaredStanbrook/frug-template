import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Context } from "hono";
import { sign } from "hono/jwt";
import { eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";

import { Auth } from "../worker/services/auth.service";
import { users } from "../worker/schema/auth.schema";
import { userRoles } from "../worker/schema/roles.schema";
import { hashPassword } from "../worker/lib/crypto";
import type { AuthConfig } from "../worker/config/auth.config";
import { createRealDb } from "./utils/realDb";

/**
 * Authentication, against a real database.
 *
 * These run on `createRealDb` rather than `createFakeDb` on purpose. The fake
 * db ignores `where` clauses, and almost every claim here is a claim about
 * which row a `where` matched — "the wrong password is refused" passes
 * trivially against a stub that returns the same user for any query. A green
 * suite there would mean nothing at all.
 *
 * What is pinned down below is the behaviour that is expensive to get wrong
 * and invisible when it is: what a session token is trusted for, what a
 * failed attempt costs, and what leaves the service attached to a user.
 */

const JWT_SECRET = "test-secret-not-a-real-one";

const createAuthConfig = (over: Partial<AuthConfig["security"]> = {}): AuthConfig => ({
  methods: new Set(["password", "pin", "totp"] as any),
  session: { duration: 1000, renewalThreshold: 500, maxSessions: 5 },
  security: {
    maxFailedAttempts: 3,
    lockoutDuration: 900000,
    requireEmailVerification: false,
    requirePhoneVerification: false,
    allowedEmails: [],
    jwtSecret: JWT_SECRET,
    jwtExpiry: 3600,
    ...over,
  },
  roles: { available: ["user", "admin"], default: "user", restricted: ["admin"], inherent: {} },
  permissions: { available: [] },
  password: {
    minLength: 8,
    requireUppercase: false,
    requireLowercase: false,
    requireNumbers: false,
    requireSpecialChars: false,
  },
});

const kvStub = () =>
  ({
    put: async () => {},
    get: async () => null,
    delete: async () => {},
  }) as any;

let db: any;
beforeEach(() => {
  db = createRealDb().db;
});

/**
 * Run `body` inside a genuine Hono context, so cookies are set the way they
 * are in production and can be read back off the response.
 */
const inContext = async <T>(
  body: (auth: Auth, c: Context) => Promise<T>,
  opts: {
    url?: string;
    env?: Record<string, unknown>;
    config?: AuthConfig;
    headers?: Record<string, string>;
  } = {},
) => {
  const app = new Hono();
  let value: T | undefined;
  let error: unknown;

  app.all("*", async (c) => {
    const auth = new Auth(c, db, kvStub(), opts.config ?? createAuthConfig(), () => true);
    try {
      value = await body(auth, c);
    } catch (e) {
      error = e;
    }
    return c.body(null, 204);
  });

  const res = await app.fetch(
    new Request(opts.url ?? "https://app.test/", { headers: opts.headers }),
    opts.env ?? {},
  );

  return { value, error, res, message: error instanceof Error ? error.message : undefined };
};

/** A user with a real PBKDF2 hash, as registration would produce. */
const seedUser = async (over: Record<string, unknown> = {}) => {
  const [row] = await db
    .insert(users)
    .values({
      email: "member@example.com",
      username: "member",
      passwordHash: await hashPassword("correct horse battery"),
      isActive: true,
      updatedAt: new Date().toISOString(),
      ...over,
    })
    .returning();
  await db.insert(userRoles).values({ userId: row.id, role: "user" });
  return row;
};

const readUser = (id: string) => db.select().from(users).where(eq(users.id, id)).get();

const cookieFrom = (res: Response) => res.headers.get("set-cookie") ?? "";

describe("session tokens", () => {
  it("issues a cookie that validates back to the same user", async () => {
    const user = await seedUser();

    const issued = await inContext(async (auth) => {
      await auth.createSession({ id: user.id, roles: ["user"] });
      return null;
    });
    const token = cookieFrom(issued.res).match(/auth_token=([^;]+)/)?.[1];
    expect(token, "no auth_token cookie was set").toBeTruthy();

    const check = await inContext((auth) => auth.validateSession(token!));
    expect((check.value as any).user?.id).toBe(user.id);
  });

  it("protects the cookie: HttpOnly, Secure on https, Lax", async () => {
    await inContext(async (auth) => auth.createSession({ id: "u1", roles: ["user"] }));
    const cookie = cookieFrom(
      (await inContext(async (auth) => auth.createSession({ id: "u1", roles: ["user"] }))).res,
    );

    // HttpOnly keeps the token out of reach of any script on the page.
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    // Strict would drop the cookie when arriving from an external link, so a
    // signed-in user following a link from email would look signed out.
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });

  it("omits Secure over plain http, so local development still works", async () => {
    const { res } = await inContext(
      async (auth) => auth.createSession({ id: "u1", roles: ["user"] }),
      { url: "http://localhost:3000/" },
    );
    expect(cookieFrom(res)).not.toContain("Secure");
  });

  it("rejects a token signed with a different secret", async () => {
    const user = await seedUser();
    const forged = await sign(
      { sub: user.id, role: ["admin"], exp: Math.floor(Date.now() / 1000) + 3600 },
      "not-the-real-secret",
      "HS256",
    );

    const { value } = await inContext((auth) => auth.validateSession(forged));
    expect((value as any).user).toBeNull();
  });

  it("rejects an expired token", async () => {
    const user = await seedUser();
    const stale = await sign(
      { sub: user.id, role: ["user"], exp: Math.floor(Date.now() / 1000) - 60 },
      JWT_SECRET,
      "HS256",
    );

    const { value } = await inContext((auth) => auth.validateSession(stale));
    expect((value as any).user).toBeNull();
  });

  /**
   * The token carries a `role` claim, and nothing reads it. Roles come back
   * from the database on every request, so a claim that says otherwise — from
   * a leaked signing key, or a role revoked after the token was issued —
   * cannot grant anything.
   */
  it("takes roles from the database, never from the token", async () => {
    const user = await seedUser();
    const claimsAdmin = await sign(
      { sub: user.id, role: ["admin"], exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET,
      "HS256",
    );

    const { value } = await inContext((auth) => auth.validateSession(claimsAdmin));
    expect((value as any).user.roles).toEqual(["user"]);
  });

  it("stops honouring the session of a deactivated account", async () => {
    const user = await seedUser();
    const token = await sign(
      { sub: user.id, role: ["user"], exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET,
      "HS256",
    );

    expect(((await inContext((a) => a.validateSession(token))).value as any).user).not.toBeNull();

    await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

    // Without this, deactivating someone only stops their next sign-in; a
    // token already in their browser keeps working until it expires.
    expect(((await inContext((a) => a.validateSession(token))).value as any).user).toBeNull();
  });
});

describe("password login", () => {
  it("accepts the right password, by email or by username", async () => {
    await seedUser();

    for (const identifier of ["member@example.com", "member"]) {
      const { value, message } = await inContext((auth) =>
        auth.loginWithPassword(identifier, "correct horse battery"),
      );
      expect(message, `login as ${identifier}`).toBeUndefined();
      expect((value as any).user.email).toBe("member@example.com");
    }
  });

  it("refuses the wrong password", async () => {
    await seedUser();
    const { message } = await inContext((auth) =>
      auth.loginWithPassword("member@example.com", "wrong"),
    );
    expect(message).toBe("Invalid credentials");
  });

  /** Same wording for an unknown account, so the form is not a user directory. */
  it("gives an unknown account the same answer as a wrong password", async () => {
    await seedUser();
    const { message } = await inContext((auth) =>
      auth.loginWithPassword("nobody@example.com", "correct horse battery"),
    );
    expect(message).toBe("Invalid credentials");
  });

  it("refuses a deactivated account that knows its password", async () => {
    await seedUser({ isActive: false });
    const { message } = await inContext((auth) =>
      auth.loginWithPassword("member@example.com", "correct horse battery"),
    );
    expect(message).toBe("Invalid credentials");
  });

  /**
   * The one invariant worth stating twice: nothing that leaves this service
   * carries a credential. `toSafeUser` is the only exit, and this is what
   * would notice a path that skipped it.
   */
  it("never hands back a password hash, pin or TOTP secret", async () => {
    await seedUser({ pin: await hashPassword("1234"), totpSecret: "JBSWY3DPEHPK3PXP" });

    const { value } = await inContext((auth) =>
      auth.loginWithPassword("member@example.com", "correct horse battery"),
    );
    const returned = (value as any).user;

    expect(returned).not.toHaveProperty("passwordHash");
    expect(returned).not.toHaveProperty("pin");
    expect(returned).not.toHaveProperty("totpSecret");
    expect(JSON.stringify(returned)).not.toContain("JBSWY3DPEHPK3PXP");
  });
});

describe("lockout", () => {
  it("locks the account after the configured number of failures", async () => {
    const user = await seedUser();

    for (let i = 0; i < 3; i++) {
      await inContext((auth) => auth.loginWithPassword("member@example.com", "wrong"));
    }

    expect((await readUser(user.id)).failedLoginAttempts).toBe(3);

    // Locked means locked: the right password is refused too, or the lockout
    // is only a speed bump for someone who has just guessed correctly.
    const { message } = await inContext((auth) =>
      auth.loginWithPassword("member@example.com", "correct horse battery"),
    );
    expect(message).toBe("Account is temporarily locked");
  });

  it("clears the count on a successful login", async () => {
    const user = await seedUser();

    await inContext((auth) => auth.loginWithPassword("member@example.com", "wrong"));
    expect((await readUser(user.id)).failedLoginAttempts).toBe(1);

    await inContext((auth) =>
      auth.loginWithPassword("member@example.com", "correct horse battery"),
    );

    const after = await readUser(user.id);
    expect(after.failedLoginAttempts).toBe(0);
    expect(after.lockedUntil).toBeNull();
    expect(after.lastLoginAt).toBeTruthy();
  });

  /**
   * Once a lockout has expired the count goes with it. Otherwise the counter
   * sits at the maximum for ever and the next single typo re-locks the account
   * for the full duration — three strikes the first time, one strike every
   * time after.
   */
  it("starts counting again after a lockout expires", async () => {
    const user = await seedUser();
    await db
      .update(users)
      .set({ failedLoginAttempts: 3, lockedUntil: new Date(Date.now() - 1000).toISOString() })
      .where(eq(users.id, user.id));

    await inContext((auth) => auth.loginWithPassword("member@example.com", "wrong"));

    const after = await readUser(user.id);
    expect(after.failedLoginAttempts).toBe(1);
    expect(after.lockedUntil).toBeNull();
  });
});

describe("TOTP as a second factor", () => {
  const SECRET = "JBSWY3DPEHPK3PXP";
  const currentCode = () =>
    new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(SECRET),
    }).generate();

  it("will not complete a login on the password alone", async () => {
    await seedUser({ totpEnabled: true, totpSecret: SECRET });

    const { message } = await inContext((auth) =>
      auth.loginWithPassword("member@example.com", "correct horse battery"),
    );
    expect(message).toBe("TOTP_REQUIRED");
  });

  it("completes with a valid code", async () => {
    await seedUser({ totpEnabled: true, totpSecret: SECRET });

    const { value, message } = await inContext((auth) =>
      auth.loginWithPassword("member@example.com", "correct horse battery", currentCode()),
    );
    expect(message).toBeUndefined();
    expect((value as any).user.totpEnabled).toBe(true);
  });

  /**
   * The gap this closes: a wrong code used to throw straight out, without
   * touching the failure counter. Anyone who already had the password could
   * sit and guess six digits indefinitely — the lockout protected only the
   * factor that had already been broken, and the auth log showed nothing.
   */
  it("counts a wrong code as a failed attempt, and locks out", async () => {
    const user = await seedUser({ totpEnabled: true, totpSecret: SECRET });
    const good = "correct horse battery";

    await inContext((auth) => auth.loginWithPassword("member@example.com", good, "000000"));
    expect((await readUser(user.id)).failedLoginAttempts).toBe(1);

    await inContext((auth) => auth.loginWithPassword("member@example.com", good, "000000"));
    await inContext((auth) => auth.loginWithPassword("member@example.com", good, "000000"));

    // Guess four: the account is shut, even with the correct code in hand.
    const { message } = await inContext((auth) =>
      auth.loginWithPassword("member@example.com", good, currentCode()),
    );
    expect(message).toBe("Account is temporarily locked");
  });
});

describe("registration", () => {
  it("turns a registration into a usable login", async () => {
    const { message } = await inContext((auth) =>
      auth.register({ email: "new@example.com", password: "a-good-password" } as any),
    );
    expect(message).toBeUndefined();

    const { value } = await inContext((auth) =>
      auth.loginWithPassword("new@example.com", "a-good-password"),
    );
    expect((value as any).user.email).toBe("new@example.com");
  });

  it("stores the password as a hash, never as given", async () => {
    await inContext((auth) =>
      auth.register({ email: "new@example.com", password: "a-good-password" } as any),
    );

    const row = await db.select().from(users).where(eq(users.email, "new@example.com")).get();
    expect(row.passwordHash).not.toContain("a-good-password");
    expect(row.passwordHash).toMatch(/^[\w-]+\.[\w-]+$/); // salt.hash
  });

  it("honours an invite-only allow list", async () => {
    const config = createAuthConfig({ allowedEmails: ["invited@example.com"] });

    const blocked = await inContext(
      (auth) =>
        auth.register({ email: "gatecrasher@example.com", password: "a-good-password" } as any),
      { config },
    );
    expect(blocked.message).toMatch(/invite-only/i);

    const allowed = await inContext(
      (auth) => auth.register({ email: "invited@example.com", password: "a-good-password" } as any),
      { config },
    );
    expect(allowed.message).toBeUndefined();
  });

  it("refuses a self-assigned restricted role, and creates nothing", async () => {
    const { message } = await inContext((auth) =>
      auth.register({
        email: "climber@example.com",
        password: "a-good-password",
        role: "admin",
      } as any),
    );

    expect(message).toMatch(/not authorized/i);
    const row = await db.select().from(users).where(eq(users.email, "climber@example.com")).get();
    expect(row, "a refused registration should leave no account behind").toBeUndefined();
  });

  /**
   * The bootstrap admin is the one path that grants `admin` without an admin
   * to grant it, so the condition that disarms it is worth pinning: it applies
   * only while no admin exists. Once one does, the variable is inert — still
   * set, still matching the address, and no longer able to promote anyone.
   */
  const env = { BOOTSTRAP_ADMIN_EMAIL: "owner@example.com" };

  const rolesOf = async (email: string) => {
    const row = await db.select().from(users).where(eq(users.email, email)).get();
    const rows = await db.select().from(userRoles).where(eq(userRoles.userId, row.id));
    return rows.map((r: any) => r.role);
  };

  it("promotes the bootstrap admin when no admin exists", async () => {
    await inContext(
      (auth) => auth.register({ email: "owner@example.com", password: "a-good-password" } as any),
      { env },
    );
    expect(await rolesOf("owner@example.com")).toContain("admin");
  });

  it("is inert once an admin exists, variable set or not", async () => {
    // Somebody is already an admin, by whatever route.
    const existing = await seedUser({ email: "first@example.com", username: "first" });
    await db.insert(userRoles).values({ userId: existing.id, role: "admin" });

    await inContext(
      (auth) => auth.register({ email: "owner@example.com", password: "a-good-password" } as any),
      { env },
    );

    // Same address, same variable — and no promotion, because the condition
    // that matters is "no admin yet", not "this is the right email".
    expect(await rolesOf("owner@example.com")).not.toContain("admin");
  });

  it("ignores an address that does not match the variable", async () => {
    await inContext(
      (auth) => auth.register({ email: "someone@example.com", password: "a-good-password" } as any),
      { env },
    );
    expect(await rolesOf("someone@example.com")).not.toContain("admin");
  });
});
