import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Context } from "hono";
import { sign } from "hono/jwt";
import { eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";

import { Auth } from "../worker/services/auth.service";
import { users, verificationCodes } from "../worker/schema/auth.schema";
import { sessions } from "../worker/schema/session.schema";
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
  // Real durations. These were 1000/500 when nothing read them; now that the
  // session row's expiry is enforced, a one-second session expires between one
  // step of a test and the next — which looks like a revocation bug and is not.
  session: { duration: 24 * 60 * 60 * 1000, renewalThreshold: 60 * 60 * 1000, maxSessions: 5 },
  security: {
    maxFailedAttempts: 3,
    lockoutDuration: 900000,
    requireEmailVerification: false,
    requirePhoneVerification: false,
    allowedEmails: [],
    jwtSecret: JWT_SECRET,
    jwtExpiry: 3600,
    // Deliberately low: these tests hash dozens of passwords, and the cost of
    // the real setting is the point of the real setting, not of this suite.
    hashIterations: 1000,
    ...over,
  },
  roles: { available: ["user", "admin"], default: "user", restricted: ["admin"], inherent: {} },
  permissions: { available: [] },
  // The shipped defaults: length is the rule, composition is opt-in.
  password: {
    minLength: 12,
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

/**
 * A hash in the pre-versioning format: `salt.hash`, always 100,000 rounds.
 * Written out by hand because nothing produces it any more — which is the
 * point of the test that uses it.
 */
const legacyHash = async (password: string) => {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  const b64 = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  return `${b64(salt)}.${b64(new Uint8Array(bits))}`;
};

/**
 * Trigger a reset and read the code back.
 *
 * The template has no mail transport, so `requestPasswordReset` logs the code
 * — which is exactly how a developer would get at it locally, and the only
 * handle a test has on it now that the stored copy is hashed.
 */
const requestResetAndCaptureCode = async () => {
  const logged: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => logged.push(args.join(" "));
  try {
    await inContext((auth) => auth.requestPasswordReset("member@example.com"));
  } finally {
    console.log = original;
  }
  const match = logged.join("\n").match(/([0-9a-f]{32})/);
  if (!match) throw new Error("no reset code was logged");
  return match[1];
};

const cookieFrom = (res: Response) => res.headers.get("set-cookie") ?? "";

const tokenFrom = (res: Response) => cookieFrom(res).match(/auth_token=([^;]+)/)?.[1];

/** Sign in properly and hand back the cookie's token plus the session id. */
const openSession = async (userId: string, headers?: Record<string, string>) => {
  let sessionId = "";
  const { res } = await inContext(
    async (auth) => {
      const out = await auth.createSession({ id: userId, roles: ["user"] });
      sessionId = out.sessionId;
      return out;
    },
    { headers },
  );
  return { token: tokenFrom(res)!, sessionId, res };
};

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
    const user = await seedUser();
    const cookie = cookieFrom((await openSession(user.id)).res);

    // HttpOnly keeps the token out of reach of any script on the page.
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    // Strict would drop the cookie when arriving from an external link, so a
    // signed-in user following a link from email would look signed out.
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });

  it("omits Secure over plain http, so local development still works", async () => {
    const user = await seedUser();
    const { res } = await inContext(
      async (auth) => auth.createSession({ id: user.id, roles: ["user"] }),
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
    const { sessionId } = await openSession(user.id);

    // A live session, correctly signed, whose role claim says otherwise.
    const claimsAdmin = await sign(
      { sub: user.id, jti: sessionId, role: ["admin"], exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET,
      "HS256",
    );

    const { value } = await inContext((auth) => auth.validateSession(claimsAdmin));
    expect((value as any).user.roles).toEqual(["user"]);
  });

  it("stops honouring the session of a deactivated account", async () => {
    const user = await seedUser();
    const { token } = await openSession(user.id);

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
      auth.register({ email: "new@example.com", password: "a-long-enough-password" } as any),
    );
    expect(message).toBeUndefined();

    const { value } = await inContext((auth) =>
      auth.loginWithPassword("new@example.com", "a-long-enough-password"),
    );
    expect((value as any).user.email).toBe("new@example.com");
  });

  it("stores the password as a hash, never as given", async () => {
    await inContext((auth) =>
      auth.register({ email: "new@example.com", password: "a-long-enough-password" } as any),
    );

    const row = await db.select().from(users).where(eq(users.email, "new@example.com")).get();
    expect(row.passwordHash).not.toContain("a-long-enough-password");
    // algorithm $ cost $ salt $ hash — the cost travels with the hash so it
    // can be raised later without invalidating what is already stored.
    expect(row.passwordHash).toMatch(/^pbkdf2-sha256\$\d+\$[\w-]+\$[\w-]+$/);
  });

  it("honours an invite-only allow list", async () => {
    const config = createAuthConfig({ allowedEmails: ["invited@example.com"] });

    const blocked = await inContext(
      (auth) =>
        auth.register({
          email: "gatecrasher@example.com",
          password: "a-long-enough-password",
        } as any),
      { config },
    );
    expect(blocked.message).toMatch(/invite-only/i);

    const allowed = await inContext(
      (auth) =>
        auth.register({ email: "invited@example.com", password: "a-long-enough-password" } as any),
      { config },
    );
    expect(allowed.message).toBeUndefined();
  });

  it("refuses a self-assigned restricted role, and creates nothing", async () => {
    const { message } = await inContext((auth) =>
      auth.register({
        email: "climber@example.com",
        password: "a-long-enough-password",
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
      (auth) =>
        auth.register({ email: "owner@example.com", password: "a-long-enough-password" } as any),
      { env },
    );
    expect(await rolesOf("owner@example.com")).toContain("admin");
  });

  it("is inert once an admin exists, variable set or not", async () => {
    // Somebody is already an admin, by whatever route.
    const existing = await seedUser({ email: "first@example.com", username: "first" });
    await db.insert(userRoles).values({ userId: existing.id, role: "admin" });

    await inContext(
      (auth) =>
        auth.register({ email: "owner@example.com", password: "a-long-enough-password" } as any),
      { env },
    );

    // Same address, same variable — and no promotion, because the condition
    // that matters is "no admin yet", not "this is the right email".
    expect(await rolesOf("owner@example.com")).not.toContain("admin");
  });

  it("ignores an address that does not match the variable", async () => {
    await inContext(
      (auth) =>
        auth.register({ email: "someone@example.com", password: "a-long-enough-password" } as any),
      { env },
    );
    expect(await rolesOf("someone@example.com")).not.toContain("admin");
  });
});

describe("session revocation", () => {
  it("signing out kills the token, not just the cookie", async () => {
    const user = await seedUser();
    const { token, sessionId } = await openSession(user.id);

    // Sign out from a request that carries the session.
    await inContext(async (auth) => {
      await auth.validateSession(token);
      await auth.destroySession();
    });

    // The same token, replayed — as anyone who copied it before logout would.
    // The cookie is gone from that browser; the token is not gone from theirs.
    const { value } = await inContext((auth) => auth.validateSession(token));
    expect((value as any).user).toBeNull();

    const row = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row.revokedAt).toBeTruthy();
    expect(row.revokedReason).toBe("logout");
  });

  it("ends one device without touching the others", async () => {
    const user = await seedUser();
    const laptop = await openSession(user.id, { "user-agent": "laptop" });
    const phone = await openSession(user.id, { "user-agent": "phone" });

    await inContext((auth) => auth.revokeSession(laptop.sessionId, "revoked_by_user"));

    expect(
      ((await inContext((a) => a.validateSession(laptop.token))).value as any).user,
    ).toBeNull();
    expect(
      ((await inContext((a) => a.validateSession(phone.token))).value as any).user,
    ).not.toBeNull();
  });

  it("signs out everywhere but here", async () => {
    const user = await seedUser();
    const here = await openSession(user.id);
    const elsewhere = [await openSession(user.id), await openSession(user.id)];

    const { value } = await inContext(async (auth) => {
      await auth.validateSession(here.token);
      return auth.revokeAllSessions(user.id, { except: here.sessionId, reason: "revoked_by_user" });
    });

    expect(value).toBe(2);
    expect(
      ((await inContext((a) => a.validateSession(here.token))).value as any).user,
    ).not.toBeNull();
    for (const gone of elsewhere) {
      expect(
        ((await inContext((a) => a.validateSession(gone.token))).value as any).user,
      ).toBeNull();
    }
  });

  it("changing a password ends every other session", async () => {
    const user = await seedUser();
    const here = await openSession(user.id);
    const stolen = await openSession(user.id);

    await inContext(async (auth) => {
      await auth.validateSession(here.token);
      return auth.changePassword(user.id, {
        currentPassword: "correct horse battery",
        newPassword: "a-different-long-password",
      } as any);
    });

    // Whoever learned the old password does not keep what it bought them —
    // which is the entire reason for changing it.
    expect(
      ((await inContext((a) => a.validateSession(stolen.token))).value as any).user,
    ).toBeNull();
    // The tab doing the changing stays signed in.
    expect(
      ((await inContext((a) => a.validateSession(here.token))).value as any).user,
    ).not.toBeNull();
  });

  it("keeps only maxSessions devices, oldest out first", async () => {
    const user = await seedUser();
    const config = createAuthConfig();
    config.session.maxSessions = 2;

    const first = await openSession(user.id);
    const second = await openSession(user.id);
    let third = "";
    await inContext(
      async (auth) => {
        third = (await auth.createSession({ id: user.id, roles: ["user"] })).sessionId;
      },
      { config },
    );

    const live = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id))
      .then((rows: any[]) => rows.filter((r) => !r.revokedAt).map((r) => r.id));

    expect(live).toContain(third);
    expect(live).toContain(second.sessionId);
    expect(live).not.toContain(first.sessionId);
  });

  it("lists the live sessions, marking the current one", async () => {
    const user = await seedUser();
    const here = await openSession(user.id, { "user-agent": "here-browser" });
    await openSession(user.id, { "user-agent": "other-browser" });

    const { value } = await inContext(async (auth) => {
      await auth.validateSession(here.token);
      return auth.listSessions(user.id);
    });

    const list = value as any[];
    expect(list).toHaveLength(2);
    expect(list.filter((s) => s.current)).toHaveLength(1);
    expect(list.find((s) => s.current).id).toBe(here.sessionId);
    expect(list.map((s) => s.userAgent)).toContain("other-browser");
  });

  it("refuses a token naming a session that never existed", async () => {
    const user = await seedUser();
    const invented = await sign(
      {
        sub: user.id,
        jti: "00000000-0000-0000-0000-000000000000",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      JWT_SECRET,
      "HS256",
    );

    expect(((await inContext((a) => a.validateSession(invented))).value as any).user).toBeNull();
  });

  it("refuses a session belonging to somebody else", async () => {
    const mine = await seedUser();
    const theirs = await seedUser({ email: "other@example.com", username: "other" });
    const { sessionId } = await openSession(theirs.id);

    // Correctly signed, live session — but the subject is not its owner.
    const mismatched = await sign(
      { sub: mine.id, jti: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET,
      "HS256",
    );

    expect(((await inContext((a) => a.validateSession(mismatched))).value as any).user).toBeNull();
  });

  it("refuses a session past its expiry, whatever the token says", async () => {
    const user = await seedUser();
    const { token, sessionId } = await openSession(user.id);

    // The JWT is still valid for an hour; the row is not.
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(sessions.id, sessionId));

    expect(((await inContext((a) => a.validateSession(token))).value as any).user).toBeNull();
  });
});

describe("email case", () => {
  it("signs in whatever the capitalisation", async () => {
    await inContext((auth) =>
      auth.register({ email: "Jared@Example.com", password: "a-long-enough-password" } as any),
    );

    for (const spelling of ["jared@example.com", "Jared@Example.com", "JARED@EXAMPLE.COM"]) {
      const { value, message } = await inContext((auth) =>
        auth.loginWithPassword(spelling, "a-long-enough-password"),
      );
      expect(message, `signing in as ${spelling}`).toBeUndefined();
      expect((value as any).user.email).toBe("jared@example.com");
    }
  });

  it("will not let one mailbox become two accounts", async () => {
    await inContext((auth) =>
      auth.register({ email: "Jared@Example.com", password: "a-long-enough-password" } as any),
    );
    const { message } = await inContext((auth) =>
      auth.register({ email: "jared@example.com", password: "a-long-enough-password" } as any),
    );

    expect(message).toBe("Email already registered");
  });
});

describe("password policy", () => {
  const strict = () => {
    const config = createAuthConfig();
    config.password = {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
    };
    return config;
  };

  it("applies the configured rules on registration", async () => {
    const config = strict();
    const { message } = await inContext(
      (auth) => auth.register({ email: "weak@example.com", password: "short" } as any),
      { config },
    );

    // Everything wrong with it, in one go — not one rule at a time.
    expect(message).toContain("at least 12 characters");
    expect(message).toContain("capital letter");
    expect(message).toContain("number");
    expect(message).toContain("symbol");
  });

  it("accepts a password that satisfies them", async () => {
    const { message } = await inContext(
      (auth) => auth.register({ email: "ok@example.com", password: "Str0ng-Enough!" } as any),
      { config: strict() },
    );
    expect(message).toBeUndefined();
  });

  it("applies the same rules to a password change", async () => {
    const user = await seedUser();
    const { message } = await inContext(
      (auth) =>
        auth.changePassword(user.id, {
          currentPassword: "correct horse battery",
          newPassword: "short",
        } as any),
      { config: strict() },
    );
    expect(message).toContain("at least 12 characters");
  });

  it("defaults to length over composition rules", async () => {
    // NIST's position, and the template's default: a long passphrase with no
    // capitals, digits or symbols is fine; a short cryptic one is not.
    const passphrase = await inContext((auth) =>
      auth.register({ email: "phrase@example.com", password: "correct horse battery" } as any),
    );
    expect(passphrase.message).toBeUndefined();

    const short = await inContext((auth) =>
      auth.register({ email: "short@example.com", password: "Aa1!xyz" } as any),
    );
    expect(short.message).toContain("at least 12 characters");
  });
});

describe("password hashing", () => {
  it("upgrades an old hash on the next successful sign-in", async () => {
    const user = await seedUser();

    // A hash in the pre-versioning format, which was always 100,000 rounds.
    const legacy = await legacyHash("correct horse battery");
    await db.update(users).set({ passwordHash: legacy }).where(eq(users.id, user.id));
    expect((await readUser(user.id)).passwordHash).toBe(legacy);

    const config = createAuthConfig();
    config.security.hashIterations = 150_000;

    const { message } = await inContext(
      (auth) => auth.loginWithPassword("member@example.com", "correct horse battery"),
      { config },
    );
    expect(message, "the old hash must still verify").toBeUndefined();

    // Same password, re-stored at the current cost — no reset email needed.
    const after = (await readUser(user.id)).passwordHash;
    expect(after).not.toBe(legacy);
    expect(after).toMatch(/^pbkdf2-sha256\$150000\$/);

    // And it still works afterwards.
    const again = await inContext(
      (auth) => auth.loginWithPassword("member@example.com", "correct horse battery"),
      { config },
    );
    expect(again.message).toBeUndefined();
  });

  it("leaves a hash alone when it is already current", async () => {
    const user = await seedUser();
    const before = (await readUser(user.id)).passwordHash;

    await inContext((auth) =>
      auth.loginWithPassword("member@example.com", "correct horse battery"),
    );

    expect((await readUser(user.id)).passwordHash).toBe(before);
  });
});

describe("password reset", () => {
  it("stores a hash of the reset code, not the code", async () => {
    await seedUser();
    const code = await requestResetAndCaptureCode();

    const [row] = await db.select().from(verificationCodes);
    // A reset code in the clear is a password equivalent for every pending
    // reset in the table.
    expect(row.code).not.toBe(code);
    expect(row.code).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts the real code once, and never again", async () => {
    const user = await seedUser();
    const code = await requestResetAndCaptureCode();

    const first = await inContext((auth) => auth.resetPassword(code, "a-brand-new-password"));
    expect(first.message).toBeUndefined();

    const second = await inContext((auth) => auth.resetPassword(code, "another-new-password"));
    expect(second.message).toMatch(/invalid or expired/i);

    const { value } = await inContext((auth) =>
      auth.loginWithPassword("member@example.com", "a-brand-new-password"),
    );
    expect((value as any).user.id).toBe(user.id);
  });

  it("refuses a code that is merely well-formed", async () => {
    await seedUser();
    await requestResetAndCaptureCode();

    const { message } = await inContext((auth) =>
      auth.resetPassword("f".repeat(32), "a-brand-new-password"),
    );
    expect(message).toMatch(/invalid or expired/i);
  });

  it("ends every existing session", async () => {
    const user = await seedUser();
    const open = await openSession(user.id);
    const code = await requestResetAndCaptureCode();

    await inContext((auth) => auth.resetPassword(code, "a-brand-new-password"));

    // Unlike a password change, a reset spares nothing: the person resetting
    // may not be the person signed in, and that is usually the point.
    expect(((await inContext((a) => a.validateSession(open.token))).value as any).user).toBeNull();
  });
});
