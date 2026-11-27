// worker/services/auth.service.ts
import { eq, and, or, gt, desc, isNull } from "drizzle-orm";
import { verify } from "hono/jwt";
import { z } from "zod";
import {
  users,
  credentials,
  authLogs,
  verificationCodes,
  updateUserProfileSchema,
  changePasswordRequestSchema,
  changePinRequestSchema,
} from "../schema/auth.schema";
import type { RegisterUser, InsertUser, InsertAuthLog, SafeUser } from "../schema/auth.schema";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/types";
import { hashPassword, verifyPassword, randomString, needsRehash, hashSecret } from "../lib/crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import type { AuthConfig } from "../config/auth.config";
import { userRoles } from "../schema/roles.schema";
import { sessions } from "../schema/session.schema";
import type { SessionSummary } from "../schema/session.schema";
import { RoleService } from "./roles.service";
import type { Context } from "hono";
import { sign } from "hono/jwt";
import { setCookie, deleteCookie } from "hono/cookie";
import * as OTPAuth from "otpauth";
import { emailFlowsAvailable, linkEmail, sendEmail } from "./email.service";

/**
 * Signing algorithm for the session JWT. `sign` defaults to HS256; `verify`
 * takes it explicitly, so keep both reading from this constant — a mismatch
 * silently rejects every session.
 */
const JWT_ALG = "HS256" as const;

/** SHA-256 of a one-time token, hex, for storing reset codes at rest. */
const hashToken = async (token: string) =>
  Array.from(await hashSecret(token))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/**
 * Session timestamps: ISO-8601, with milliseconds.
 *
 * Deliberately not SQLite's `current_timestamp`, which resolves to the second.
 * Sessions opened within the same second would then sort arbitrarily against
 * each other, and `enforceSessionLimit` decides which ones to end by that
 * order — so signing in on a third device could sign you out of the wrong one.
 * Every session row written here sets these explicitly, so they are all the
 * same shape and genuinely comparable.
 */
const sessionNow = () => new Date().toISOString();

/**
 * One-time links sent by email, stored hashed in `verification_codes` by
 * type. A reset link is short-lived because it is a password equivalent; a
 * confirmation link only proves a mailbox, so it can wait in an inbox a day.
 */
type LinkTokenType = "password_reset" | "email_verify";
const RESET_LINK_TTL = 60 * 60 * 1000;
const VERIFY_LINK_TTL = 24 * 60 * 60 * 1000;
/** At most one link of each type per account per minute. See `issueLinkToken`. */
const LINK_COOLDOWN = 60 * 1000;

const CHALLENGE_PREFIX = "challenge:";
const CHALLENGE_TTL = 300; // 5 minutes

/**
 * A well-formed hash that no password matches, verified against when the
 * account does not exist.
 *
 * Without it, an unknown identifier returns immediately while a known one
 * pays for a 100,000-iteration PBKDF2 — a timing difference large enough to
 * read over the network, which turns the login form into an oracle for
 * "is this person a user here". The error message is identical either way;
 * this makes the clock match the message.
 */
const ABSENT_USER_HASH = "AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** Every passkey sign-in failure the visitor could learn from says only this. */
const PASSKEY_SIGN_IN_FAILED =
  "Could not sign in with a passkey for that email. Check it, or sign in another way.";

export class Auth {
  private db: any;
  private kv: KVNamespace;
  private authConfig: AuthConfig;
  private isMethodEnabled: (method: string) => boolean;
  private c: Context;
  private roleService: RoleService;

  public user: SafeUser | null = null;
  public session: { id: string } | null = null;

  constructor(
    c: Context,
    db: any,
    kv: KVNamespace,
    authConfig: AuthConfig,
    isMethodEnabled: (method: string) => boolean,
  ) {
    this.c = c;
    this.db = db;
    this.kv = kv;
    this.authConfig = authConfig;
    this.isMethodEnabled = isMethodEnabled;
    this.roleService = new RoleService(db, authConfig);
  }

  // ==========================================
  // HELPERS
  // ==========================================

  /**
   * Extracts IP and UserAgent from the Hono Context.
   * Supports Cloudflare Workers specific headers.
   */
  private getContextDetails() {
    const ipAddress =
      this.c.req.header("cf-connecting-ip") || this.c.req.header("x-forwarded-for") || "unknown";
    const userAgent = this.c.req.header("user-agent") || "unknown";
    return { ipAddress, userAgent };
  }

  /**
   * Centralized check to see if a specific email is allowed to register.
   * Throws an error if the ALLOWED_EMAIL env var is set and the email doesn't match.
   */
  private validateRegistrationEligibility(email: string) {
    // Access the parsed array from your config object
    const allowedList = this.authConfig.security.allowedEmails;

    // If the list is empty, we assume registration is open to everyone
    if (!allowedList || allowedList.length === 0) {
      return;
    }

    // Check if the email exists in the list (Case Insensitive)
    const isAllowed = allowedList.some(
      (allowedEmail) => allowedEmail.toLowerCase() === email.toLowerCase(),
    );

    if (!isAllowed) {
      console.warn(`Blocked registration attempt for: ${email}`);
      throw new Error("Registration is currently invite-only.");
    }
  }
  /**
   * Whether anyone may register right now.
   *
   * Always true unless SINGLE_ACCOUNT is on. Then the site has exactly one
   * owner: sign-up is open only while no account exists, and only to
   * BOOTSTRAP_ADMIN_EMAIL — so the one account that can ever be created is the
   * admin. Without the email check, whoever found the site first after a
   * deploy would take the only account, and as a plain user with no way to
   * make anyone an admin.
   */
  async isRegistrationOpen(): Promise<boolean> {
    if (!this.authConfig.security.singleAccount) return true;
    if (!(this.c.env.BOOTSTRAP_ADMIN_EMAIL || "").trim()) return false;
    const [anyone] = await this.db.select({ id: users.id }).from(users).limit(1);
    return !anyone;
  }

  /** Throws unless `email` may register now. Every sign-up path calls this. */
  private async assertRegistrationOpen(email: string) {
    if (!(await this.isRegistrationOpen())) {
      throw new Error("Sign-up is closed on this site.");
    }
    if (!this.authConfig.security.singleAccount) return;

    const owner = (this.c.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
    if (email.trim().toLowerCase() !== owner) {
      // Same message as closed: the form must not confirm which address owns the site.
      console.warn(`Blocked single-account registration for: ${email}`);
      throw new Error("Sign-up is closed on this site.");
    }
  }

  /**
   * The one place an email address is turned into the form we store and
   * compare. Lowercased and trimmed.
   *
   * SQLite compares text case-sensitively, so skipping this anywhere brings
   * back a bug that is very hard to report: registering as `Jared@example.com`
   * and later signing in as `jared@example.com` gives "Invalid credentials",
   * and the unique index lets both addresses exist as separate accounts.
   */
  private normaliseEmail<T extends string | null | undefined>(email: T): T {
    return (typeof email === "string" ? email.trim().toLowerCase() : email) as T;
  }

  /**
   * Check a new password against the configured policy.
   *
   * `authConfig.password` was parsed from the environment and read by nothing:
   * the only check anywhere was a hard-coded `min(8)` in the zod schema, so
   * PASSWORD_MIN_LENGTH and the rest were settings that silently did nothing.
   * Every path that sets a password now comes through here.
   */
  private assertPasswordPolicy(password: string) {
    const policy = this.authConfig.password;
    if (!policy) return;

    const problems: string[] = [];
    if (password.length < policy.minLength) {
      problems.push(`be at least ${policy.minLength} characters`);
    }
    if (policy.requireUppercase && !/[A-Z]/.test(password))
      problems.push("include a capital letter");
    if (policy.requireLowercase && !/[a-z]/.test(password))
      problems.push("include a lowercase letter");
    if (policy.requireNumbers && !/[0-9]/.test(password)) problems.push("include a number");
    if (policy.requireSpecialChars && !/[^A-Za-z0-9]/.test(password)) {
      problems.push("include a symbol");
    }

    if (problems.length > 0) {
      // Say all of it at once. Revealing one rule at a time turns choosing a
      // password into a guessing game against an invisible checklist.
      throw new Error(`Password must ${problems.join(", ")}.`);
    }
  }

  private getTotpObject(secret: string, label: string = "User") {
    return new OTPAuth.TOTP({
      issuer: this.authConfig.totp?.issuer,
      label: label,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
  }
  verifyTotpCode(secret: string | null | undefined, code: string): boolean {
    if (!secret || !code) return false;

    const totp = this.getTotpObject(secret);

    const delta = totp.validate({ token: code, window: 1 });

    return delta !== null;
  }
  /**
   * Strip secrets from a raw `users` row and hydrate roles + permissions.
   *
   * Every path that hands a user back to a caller — a login response, a
   * session lookup, `this.user` — goes through here. The raw row carries
   * `passwordHash`, `pin` and `totpSecret`; returning it directly leaks
   * credentials to the client, so never skip this on the way out.
   */
  private async toSafeUser(user: any): Promise<SafeUser> {
    // One call, one concurrent query pair — see RoleService.getRolesAndPermissions.
    const { roles, permissions } = await this.roleService.getRolesAndPermissions(user.id);
    return this.safeUserFrom(user, roles, permissions);
  }

  private safeUserFrom(user: any, roles: string[], permissions: Set<string>): SafeUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      totpEnabled: user.totpEnabled,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      phoneNumber: user.phoneNumber,
      phoneVerified: user.phoneVerified,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles,
      permissions: Array.from(permissions),
    };
  }

  /**
   * First-run admin bootstrap, so a new site never needs a terminal.
   *
   * `admin` is listed in ROLES_RESTRICTED and cannot be self-assigned at
   * registration, which leaves a chicken-and-egg problem: someone has to
   * create the first admin. Rather than require a CLI, set
   * BOOTSTRAP_ADMIN_EMAIL and register normally — that one account is
   * promoted on sign-up.
   *
   * Three conditions, all required, keep this from being a back door:
   *   1. BOOTSTRAP_ADMIN_EMAIL is set to a non-empty value.
   *   2. The registering email matches it exactly (case-insensitive).
   *   3. NO admin exists yet.
   *
   * Condition 3 means the mechanism disarms itself permanently the moment it
   * succeeds. Leaving the var set afterwards is harmless, but clearing it is
   * still good hygiene.
   */
  private async resolveBootstrapRole(email: string | undefined | null, fallback: string) {
    const configured = (this.c.env.BOOTSTRAP_ADMIN_EMAIL || "").trim();
    if (!configured || !email) return fallback;
    if (configured.toLowerCase() !== email.trim().toLowerCase()) return fallback;

    const [existingAdmin] = await this.db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(eq(userRoles.role, "admin"))
      .limit(1);

    if (existingAdmin) {
      console.warn(
        "BOOTSTRAP_ADMIN_EMAIL is set but an admin already exists — ignoring. " +
          "Clear the variable; it can no longer take effect.",
      );
      return fallback;
    }

    console.log(`Bootstrapping first admin for ${email}.`);
    return "admin";
  }

  // ==========================================
  // SESSION MANAGEMENT
  // ==========================================

  async validateSession(token: string) {
    try {
      // 1. The signature proves the token is ours and unexpired.
      const payload = await verify(token, this.authConfig.security.jwtSecret, JWT_ALG);
      const userId = payload.sub as string;
      const sessionId = payload.jti as string | undefined;

      // 2. The session row decides whether it is still live. A signature alone
      //    cannot be taken back: before this table existed, signing out only
      //    deleted the cookie, so a token copied beforehand kept working for
      //    as long as it had left to run.
      if (!sessionId) return { user: null };

      // 3. Everything else this needs, in one round trip. The user id is in
      //    the verified token, so the user, roles and permissions do not have
      //    to wait for the session row: issued one after another these were
      //    four D1 hops ahead of every signed-in page, and each hop is a trip
      //    to wherever the database lives. Safe to batch because none of the
      //    four joins: drizzle reads D1 batch rows by column name, so a join
      //    with a repeated column name must not go in a batch.
      const [[session], [user], activeRoles, directPerms] = await this.db.batch([
        this.db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1),
        this.db.select().from(users).where(eq(users.id, userId)).limit(1),
        this.roleService.activeRolesQuery(userId),
        this.roleService.directPermissionsQuery(userId),
      ]);

      if (!session || session.userId !== userId) return { user: null };
      if (session.revokedAt) return { user: null };
      if (new Date(session.expiresAt) <= new Date()) return { user: null };
      if (!user) return { user: null };

      // Deactivating an account has to end the sessions it already has, or it
      // only stops the next sign-in.
      if (!user.isActive) return { user: null };

      // Bookkeeping the response does not depend on: written after it is sent.
      this.afterResponse(this.touchSession(session));

      const { roles, permissions } = this.roleService.resolve(activeRoles, directPerms);
      const safeUser = this.safeUserFrom(user, roles, permissions);
      this.user = safeUser;
      this.session = { id: session.id };

      return { user: safeUser };
    } catch (e) {
      // An expired token is the normal end of a session, not a fault. Logging
      // it at error level fills the log with routine events and teaches you to
      // scroll past the line that does matter.
      const expired = e instanceof Error && /expired/i.test(e.name + e.message);
      if (!expired) console.error("Session validation failed", e);
      return { user: null };
    }
  }

  /**
   * Let a write finish after the response has gone, via `waitUntil`. Outside
   * a Worker request (tests, scripts) there is no execution context, so it is
   * awaited inline instead; either way a failure is logged, never thrown at a
   * request that has already been answered.
   */
  afterResponse(work: Promise<unknown>) {
    const logged = work.catch((e) => console.error("Deferred write failed", e));
    try {
      this.c.executionCtx.waitUntil(logged);
    } catch {
      // No execution context: the promise still runs; nothing waits on it.
    }
  }

  /**
   * Record that the session was used, and extend it if it is near the end.
   *
   * `lastSeenAt` is written at most once a minute. It is only there so the
   * "signed in on these devices" list can say something useful, and a write on
   * every request would cost more than the information is worth.
   *
   * The renewal is what makes `session.duration` and `renewalThreshold` mean
   * something: an active session slides forward rather than logging the user
   * out mid-task, while one that is genuinely idle still reaches its expiry
   * and stops.
   */
  private async touchSession(session: { id: string; expiresAt: string; lastSeenAt: string }) {
    const now = Date.now();
    const update: Record<string, string> = {};

    if (now - new Date(session.lastSeenAt).getTime() > 60_000) {
      update.lastSeenAt = sessionNow();
    }

    const remaining = new Date(session.expiresAt).getTime() - now;
    if (remaining < this.authConfig.session.renewalThreshold) {
      update.expiresAt = new Date(now + this.authConfig.session.duration).toISOString();
    }

    if (Object.keys(update).length === 0) return;
    await this.db.update(sessions).set(update).where(eq(sessions.id, session.id));
  }

  /**
   * Open a session: one row, and a cookie naming it.
   */
  async createSession(user: { id: string; roles: string[] }) {
    const secret = this.authConfig.security.jwtSecret;
    const expiresIn = this.authConfig.security.jwtExpiry;
    const { ipAddress, userAgent } = this.getContextDetails();

    // The row's expiry is the one that counts, so it governs the cookie too.
    const duration = Math.min(this.authConfig.session.duration, expiresIn * 1000);
    const expiresAt = new Date(Date.now() + duration).toISOString();

    const [session] = await this.db
      .insert(sessions)
      .values({
        userId: user.id,
        expiresAt,
        ipAddress,
        userAgent,
        createdAt: sessionNow(),
        lastSeenAt: sessionNow(),
      })
      .returning();

    await this.enforceSessionLimit(user.id, session.id);

    const payload = {
      sub: user.id,
      // Named, so the token can be traced to a row and that row revoked. The
      // `role` claim below is informational only — roles are read from the
      // database on every request, never from here.
      jti: session.id,
      role: user.roles,
      exp: Math.floor(Date.now() / 1000) + Math.floor(duration / 1000),
    };

    const token = await sign(payload, secret, JWT_ALG);
    const isHttps =
      this.c.req.url.startsWith("https://") || this.c.req.header("x-forwarded-proto") === "https";

    setCookie(this.c, "auth_token", token, {
      httpOnly: true,
      secure: isHttps,
      // Lax, not Strict. Strict withholds the cookie on any cross-site
      // navigation, so following a link to the app from an email or a chat
      // lands the user on a signed-out page even though their session is
      // live — they sign in again, or conclude it is broken. Cross-site POSTs
      // are already refused by the origin check on the auth API.
      sameSite: "Lax",
      path: "/",
      maxAge: Math.floor(duration / 1000),
    });

    this.session = { id: session.id };
    return { token, user, sessionId: session.id };
  }

  /**
   * Keep only the most recent `maxSessions` live sessions for a user.
   *
   * `session.maxSessions` has been in the config from the start and enforced
   * nowhere, so sessions accumulated for ever: every sign-in on every device
   * left another key under the mat, and the list of them was unbounded and
   * invisible.
   */
  private async enforceSessionLimit(userId: string, keepSessionId: string) {
    const limit = this.authConfig.session.maxSessions;
    if (!limit || limit <= 0) return;

    const live = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.createdAt));

    const surplus = live.slice(limit).filter((s: { id: string }) => s.id !== keepSessionId);
    for (const stale of surplus) {
      await this.revokeSession(stale.id, "session_limit");
    }
  }

  /** Revoke one session. Idempotent, and it never un-revokes an older one. */
  async revokeSession(sessionId: string, reason: string = "logout") {
    const changed = await this.db
      .update(sessions)
      .set({ revokedAt: new Date().toISOString(), revokedReason: reason })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });

    return changed.length > 0;
  }

  /**
   * Revoke every live session for a user, optionally sparing one.
   *
   * Used for "sign out everywhere", and after a password change or reset —
   * whoever learned the old password should not keep the access it bought
   * them, which is the entire reason the user changed it.
   */
  async revokeAllSessions(userId: string, opts: { except?: string; reason?: string } = {}) {
    const live = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

    let revoked = 0;
    for (const session of live) {
      if (session.id === opts.except) continue;
      if (await this.revokeSession(session.id, opts.reason ?? "revoke_all")) revoked++;
    }
    return revoked;
  }

  /** The user's live sessions, newest first, for a "where am I signed in" list. */
  async listSessions(userId: string): Promise<SessionSummary[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.lastSeenAt));

    const now = new Date();
    return rows
      .filter((row: any) => new Date(row.expiresAt) > now)
      .map((row: any) => ({
        id: row.id,
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt,
        expiresAt: row.expiresAt,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        current: row.id === this.session?.id,
      }));
  }

  async destroySession() {
    // Revoke the row first. Clearing the cookie alone leaves a working token
    // in the hands of anyone who copied it, which is precisely the thing
    // "sign out" is supposed to prevent.
    if (this.session?.id) {
      await this.revokeSession(this.session.id, "logout");
    }

    const isHttps =
      this.c.req.url.startsWith("https://") || this.c.req.header("x-forwarded-proto") === "https";
    deleteCookie(this.c, "auth_token", {
      path: "/",
      secure: isHttps,
    });
    this.session = null;
    this.user = null;
  }

  // ==========================================
  // CHALLENGE MANAGEMENT (passkey)
  // ==========================================

  async setChallenge(challenge: string): Promise<string> {
    const challengeId = randomString(32);
    const kvKey = `${CHALLENGE_PREFIX}${challengeId}`;
    await this.kv.put(kvKey, challenge, {
      expirationTtl: CHALLENGE_TTL,
    });
    return challengeId;
  }

  async getChallenge(challengeId: string): Promise<string | null> {
    const kvKey = `${CHALLENGE_PREFIX}${challengeId}`;
    const challenge = await this.kv.get(kvKey, "text");
    if (challenge) {
      await this.kv.delete(kvKey);
    }
    return challenge;
  }

  // ==========================================
  // LOGGING
  // ==========================================

  /**
   * Logs an authentication event.
   * Automatically populates IP and UserAgent from the request context.
   */
  async logAuthEvent(
    params: Omit<InsertAuthLog, "id" | "createdAt" | "ipAddress" | "userAgent">,
  ): Promise<void> {
    const { ipAddress, userAgent } = this.getContextDetails();

    await this.db.insert(authLogs).values({
      ...params,
      ipAddress,
      userAgent,
    });
  }

  // ==========================================
  // REGISTRATION
  // ==========================================

  async register(data: RegisterUser) {
    const email = this.normaliseEmail(data.email);
    this.validateRegistrationEligibility(email);
    await this.assertRegistrationOpen(email);

    if (data.password && this.isMethodEnabled("password")) {
      this.assertPasswordPolicy(data.password);
    }

    let roleToAssign = this.authConfig.roles.default;

    if (data.role) {
      // Validation: Is this a known role?
      if (!this.authConfig.roles.available.includes(data.role)) {
        throw new Error("Invalid role requested.");
      }

      // Security: Is this a restricted role? (e.g., prevent self-registering as 'admin')
      const restricted = this.authConfig.roles.restricted || [];
      if (restricted.includes(data.role)) {
        console.warn(`Blocked attempt to self-register restricted role: ${data.role}`);
        throw new Error("You are not authorized to register with this role.");
      }

      roleToAssign = data.role;
    }
    const existingUser = await this.db.select().from(users).where(eq(users.email, email)).get();

    if (existingUser) throw new Error("Email already registered");

    const userData: InsertUser = {
      username: data.username,
      email,
      displayName: data.displayName,
      phoneNumber: data.phoneNumber,
    };

    const iterations = this.authConfig.security.hashIterations;

    if (data.password && this.isMethodEnabled("password")) {
      userData.passwordHash = await hashPassword(data.password, iterations);
    }

    if (data.pin && this.isMethodEnabled("pin")) {
      userData.pin = await hashPassword(data.pin, iterations);
    }

    const [newUser] = await this.db.insert(users).values(userData).returning();

    roleToAssign = await this.resolveBootstrapRole(newUser.email, roleToAssign);
    await this.roleService.assignRole(newUser.id, roleToAssign, undefined, undefined);

    const { roles, permissions } = await this.roleService.getRolesAndPermissions(newUser.id);

    const safeUser: SafeUser = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      displayName: newUser.displayName,
      totpEnabled: newUser.totpEnabled,
      isActive: newUser.isActive,
      emailVerified: newUser.emailVerified,
      phoneNumber: newUser.phoneNumber,
      phoneVerified: newUser.phoneVerified,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,

      roles: roles,
      permissions: Array.from(permissions),
    };
    await this.logAuthEvent({
      userId: newUser.id,
      event: "registration",
      method: data.password ? "password" : "passkey",
      metadata: JSON.stringify({ assignedRole: roleToAssign }),
    });

    // Confirm the address, after the response: sign-up should not wait on mail.
    this.afterResponse(this.sendEmailVerification(newUser));
    this.user = safeUser;

    return {
      user: safeUser,
      requiresVerification: this.authConfig.security.requireEmailVerification,
    };
  }

  // ==========================================
  // LOGIN METHODS
  // ==========================================

  private async handleFailedLogin(userId: string, method: string = "unknown") {
    const user = await this.db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return;

    const maxAttempts = this.authConfig.security.maxFailedAttempts || 5;
    const lockoutDuration = this.authConfig.security.lockoutDuration || 900000;

    // A lockout that has run its course clears the count with it. Otherwise the
    // counter stays at the maximum for ever after the first lockout, and every
    // single later typo re-locks the account for the full duration — the
    // second offence is punished harder than the first, which is not what a
    // "five attempts" policy says.
    const lockExpired = !!user.lockedUntil && new Date(user.lockedUntil) <= new Date();
    const attempts = (lockExpired ? 0 : user.failedLoginAttempts || 0) + 1;

    const updateData: any = { failedLoginAttempts: attempts, lockedUntil: null };

    if (attempts >= maxAttempts) {
      updateData.lockedUntil = new Date(Date.now() + lockoutDuration).toISOString();
    }

    await this.db.update(users).set(updateData).where(eq(users.id, userId));

    await this.logAuthEvent({ userId, event: "failed_login", method });
  }

  async loginWithPassword(identifier: string, password: string, totpCode?: string) {
    if (!this.isMethodEnabled("password"))
      throw new Error("Password authentication is not enabled");

    const user = await this.db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier), eq(users.email, this.normaliseEmail(identifier))))
      .get();

    if (!user) {
      // Spend the same time as a real verify — see ABSENT_USER_HASH.
      await verifyPassword(password, ABSENT_USER_HASH);
      throw new Error("Invalid credentials");
    }

    if (!user.isActive) throw new Error("Invalid credentials");

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new Error("Account is temporarily locked");
    }

    const isValid = await verifyPassword(password, user.passwordHash || "");

    if (!isValid) {
      await this.handleFailedLogin(user.id, "password");
      throw new Error("Invalid credentials");
    }

    if (user.totpEnabled) {
      if (!totpCode) {
        throw new Error("TOTP_REQUIRED");
      }

      // A wrong second factor is a failed login like any other. It used to
      // throw straight out, so an attacker holding the password could guess
      // the six digits for ever: no counter, no lockout, and nothing in the
      // auth log to show it happened. The lockout only defended the factor
      // that had already been broken.
      const isTotpValid = this.verifyTotpCode(user.totpSecret, totpCode);
      if (!isTotpValid) {
        await this.handleFailedLogin(user.id, "totp");
        throw new Error("Invalid 2FA Code");
      }
    }

    const freshState: Record<string, unknown> = {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date().toISOString(),
    };

    // The only moment the plaintext is in hand, so the only free moment to
    // bring an old hash up to the current cost. Raising the iteration count
    // then upgrades accounts as their owners sign in, rather than needing a
    // password reset for everybody.
    const iterations = this.authConfig.security.hashIterations;
    if (user.passwordHash && needsRehash(user.passwordHash, iterations)) {
      freshState.passwordHash = await hashPassword(password, iterations);
    }

    await this.db.update(users).set(freshState).where(eq(users.id, user.id));

    await this.logAuthEvent({
      userId: user.id,
      event: "login",
      method: "password",
    });

    const safeUser = await this.toSafeUser(user);
    this.user = safeUser;
    return { user: safeUser };
  }

  async loginWithPin(identifier: string, pin: string) {
    if (!this.isMethodEnabled("pin")) throw new Error("PIN authentication is not enabled");

    const user = await this.db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier), eq(users.email, this.normaliseEmail(identifier))))
      .get();

    if (!user || !user.pin) {
      await verifyPassword(pin, ABSENT_USER_HASH);
      throw new Error("Invalid credentials");
    }

    if (!user.isActive) throw new Error("Invalid credentials");

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new Error("Account is temporarily locked");
    }

    const isValid = await verifyPassword(pin, user.pin);

    if (!isValid) {
      await this.handleFailedLogin(user.id, "pin");
      throw new Error("Invalid credentials");
    }

    await this.db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));

    await this.logAuthEvent({
      userId: user.id,
      event: "login",
      method: "pin",
    });

    const safeUser = await this.toSafeUser(user);
    this.user = safeUser;
    return { user: safeUser };
  }

  async loginWithTotp(identifier: string, totpCode: string) {
    if (!this.isMethodEnabled("totp")) throw new Error("TOTP authentication is not enabled");

    const user = await this.db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier), eq(users.email, this.normaliseEmail(identifier))))
      .get();

    if (!user || !user.totpSecret) throw new Error("Invalid credentials");

    if (!user.isActive) throw new Error("Invalid credentials");

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new Error("Account is temporarily locked");
    }
    const isValid = this.verifyTotpCode(user.totpSecret, totpCode);

    if (!isValid) {
      await this.handleFailedLogin(user.id, "totp");
      throw new Error("Invalid TOTP code");
    }

    await this.db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));

    await this.logAuthEvent({
      userId: user.id,
      event: "login",
      method: "totp",
    });

    const safeUser = await this.toSafeUser(user);
    this.user = safeUser;
    return { user: safeUser };
  }

  // ==========================================
  // PROFILE MANAGEMENT
  // ==========================================

  async updateProfile(userId: string, data: z.infer<typeof updateUserProfileSchema>) {
    if (!this.user || this.user.id !== userId) throw new Error("Unauthorized");

    // Filter out undefined values to avoid overwriting with NULL if not intended
    const updateData: any = {};
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.phoneNumber !== undefined) updateData.phoneNumber = data.phoneNumber;

    if (Object.keys(updateData).length === 0) return;

    await this.db
      .update(users)
      .set({
        ...updateData,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    // Update the local user object so the response is immediate
    if (this.user) {
      this.user = { ...this.user, ...updateData };
    }
  }
  /**
   * Email a password reset link, if the address belongs to an active account.
   *
   * Says nothing either way. The route answers the same whether or not there
   * is an account, and runs this after the response (`afterResponse`), so the
   * time it takes does not tell a stranger either.
   */
  async requestPasswordReset(rawEmail: string) {
    if (!this.isMethodEnabled("password") || !emailFlowsAvailable(this.c.env)) return;

    const email = this.normaliseEmail(rawEmail);
    const user = await this.db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !user.isActive) return;

    const token = await this.issueLinkToken(user.id, "password_reset", RESET_LINK_TTL);
    if (!token) return;

    await this.logAuthEvent({ userId: user.id, event: "password_reset_request", method: "email" });

    const site = this.siteName();
    await sendEmail(
      this.c.env,
      linkEmail({
        to: user.email,
        subject: `Reset your ${site} password`,
        intro:
          `Someone asked to reset the password for your ${site} account. If it was you, ` +
          "this link lets you choose a new one. It works once, within an hour.",
        action: "Choose a new password",
        url: this.linkTo(`/reset-password?token=${token}`),
        outro: "If it was not you, ignore this email. Your password has not changed.",
      }),
    );
  }

  async resetPassword(token: string, newPassword: string) {
    // Before the link is spent, so a password the policy refuses does not
    // cost the user their link.
    this.assertPasswordPolicy(newPassword);

    const spent = await this.consumeLinkToken(token, "password_reset");
    if (!spent?.userId) {
      throw new Error(
        "This reset link is not valid: it may have expired or been used. Ask for a new one.",
      );
    }

    const newHash = await hashPassword(newPassword, this.authConfig.security.hashIterations);
    await this.db
      .update(users)
      .set({
        passwordHash: newHash,
        // The link proved the mailbox. And a reset is how somebody locked out
        // gets back in, so it ends the lockout as well.
        emailVerified: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, spent.userId));

    // A reset is the one case where every existing session should end without
    // exception: the person resetting is not necessarily the person signed in,
    // and that is the whole point of resetting.
    await this.revokeAllSessions(spent.userId, { reason: "password_reset" });

    await this.logAuthEvent({
      userId: spent.userId,
      event: "password_reset",
      method: "password",
    });
  }

  async changePassword(userId: string, data: z.infer<typeof changePasswordRequestSchema>) {
    if (!this.isMethodEnabled("password")) {
      throw new Error("Password authentication is disabled.");
    }

    // 1. Fetch the sensitive fields (passwordHash) which are usually excluded
    const user = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user || !user.passwordHash) {
      throw new Error("User has no password set or does not exist.");
    }

    // 2. Verify OLD password (Security Critical)
    const isMatch = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new Error("Current password is incorrect.");
    }

    this.assertPasswordPolicy(data.newPassword);

    // 3. Hash NEW password
    const newHash = await hashPassword(data.newPassword, this.authConfig.security.hashIterations);

    // 4. Update DB
    await this.db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    // 5. End every other session. Someone changing their password usually
    //    believes the old one is known, and leaving the sessions it opened
    //    running gives whoever knows it continued access to the account. This
    //    session survives, so the user is not signed out of the tab they are
    //    standing in.
    await this.revokeAllSessions(userId, {
      except: this.session?.id,
      reason: "password_change",
    });

    await this.logAuthEvent({ userId, event: "password_change", method: "password" });
  }

  async changePin(userId: string, data: z.infer<typeof changePinRequestSchema>) {
    if (!this.isMethodEnabled("pin")) {
      throw new Error("PIN authentication is disabled.");
    }

    const user = await this.db
      .select({ pin: users.pin })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user || !user.pin) {
      throw new Error("User has no PIN set.");
    }

    const isMatch = await verifyPassword(data.currentPin, user.pin);
    if (!isMatch) {
      throw new Error("Current PIN is incorrect.");
    }

    const newHash = await hashPassword(data.newPin);

    await this.db
      .update(users)
      .set({
        pin: newHash,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    await this.logAuthEvent({ userId, event: "pin_change", method: "pin" });
  }

  async deleteAccount(userId: string) {
    if (!this.user || this.user.id !== userId) throw new Error("Unauthorized");

    // 1. Delete from DB (Cascade will handle roles, sessions, credentials)
    await this.db.delete(users).where(eq(users.id, userId));

    // 2. Log the event (User is gone, but log remains)
    // Note: Since cascade might delete logs depending on your schema setup,
    // you might want to nullify the userId in logs instead of deleting them if you need audit trails.
    // For now, assuming standard delete:
    console.log(`User ${userId} deleted their account.`);
  }

  // ==========================================
  // TOTP MANAGEMENT
  // ==========================================

  async setupTotp() {
    if (!this.user) throw new Error("Unauthorized");
    if (!this.isMethodEnabled("totp")) throw new Error("TOTP is disabled");

    const secretObj = new OTPAuth.Secret({ size: 20 });
    const secret = secretObj.base32;

    const totp = this.getTotpObject(secret, this.user.email || "User");
    const otpauthUrl = totp.toString();

    return { secret, otpauthUrl };
  }

  async verifyAndEnableTotp(secret: string, code: string) {
    if (!this.user) throw new Error("Unauthorized");

    // 1. Validate using our shared helper
    const isValid = this.verifyTotpCode(secret, code);
    if (!isValid) throw new Error("Invalid TOTP code");

    // 2. Save to DB (Enable it)
    await this.db
      .update(users)
      .set({
        totpSecret: secret,
        totpEnabled: true, // Explicitly set enabled flag
      })
      .where(eq(users.id, this.user.id))
      .run();

    await this.logAuthEvent({
      userId: this.user.id,
      event: "totp_enabled",
    });

    return true;
  }

  async disableTotp() {
    if (!this.user) throw new Error("Unauthorized");

    await this.db
      .update(users)
      .set({
        totpSecret: null,
        totpEnabled: false,
      })
      .where(eq(users.id, this.user.id))
      .run();

    await this.logAuthEvent({
      userId: this.user.id,
      event: "totp_disabled",
      method: "totp",
    });
  }

  // ==========================================
  // PASSKEY: REGISTRATION
  // ==========================================

  async generatePasskeyRegistrationOptions(rawEmail: string, displayName?: string) {
    if (!this.isMethodEnabled("passkey")) throw new Error("Passkey registration is not enabled.");

    const email = this.normaliseEmail(rawEmail);
    this.validateRegistrationEligibility(email);
    await this.assertRegistrationOpen(email);

    const existingUser = await this.db.select().from(users).where(eq(users.email, email)).get();

    if (existingUser) throw new Error("Email already registered");

    const tempUserId = crypto.randomUUID();
    const options = await generateRegistrationOptions({
      rpName: this.c.env.RP_NAME,
      rpID: this.c.env.RP_ID,
      userID: isoUint8Array.fromUTF8String(tempUserId),
      userName: email,
      // What the phone or password manager shows when choosing a passkey.
      userDisplayName: displayName || email,
      attestationType: "none",
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    const challengeId = await this.setChallenge(options.challenge);
    return { options, challengeId };
  }

  async verifyPasskeyRegistration(
    rawEmail: string,
    role: string | null | undefined,
    response: RegistrationResponseJSON,
    challengeId: string,
    displayName?: string,
  ) {
    const email = this.normaliseEmail(rawEmail);
    this.validateRegistrationEligibility(email);
    await this.assertRegistrationOpen(email);

    let roleToAssign = this.authConfig.roles.default;

    if (role) {
      // Validation: Is this a known role?
      if (!this.authConfig.roles.available.includes(role)) {
        throw new Error("Invalid role requested.");
      }

      // Security: Is this a restricted role? (e.g., prevent self-registering as 'admin')
      const restricted = this.authConfig.roles.restricted || [];
      if (restricted.includes(role)) {
        console.warn(`Blocked attempt to self-register restricted role: ${role}`);
        throw new Error("You are not authorized to register with this role.");
      }

      roleToAssign = role;
    }

    const expectedChallenge = await this.getChallenge(challengeId);
    if (!expectedChallenge) throw new Error("Registration session expired. Please try again.");

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.c.env.ORIGIN,
        expectedRPID: this.c.env.RP_ID,
      });
    } catch (error) {
      console.error(error);
      throw new Error("Passkey verification failed validation.");
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("Passkey could not be verified.");
    }

    const { credential } = verification.registrationInfo;

    const existingUser = await this.db.select().from(users).where(eq(users.email, email)).get();

    if (existingUser) throw new Error("Email already registered");

    const userData: InsertUser = {
      id: crypto.randomUUID(),
      email: email,
      displayName: displayName || null,
    };
    const [newUser] = await this.db.insert(users).values(userData).returning();

    roleToAssign = await this.resolveBootstrapRole(newUser.email, roleToAssign);
    await this.roleService.assignRole(newUser.id, roleToAssign, undefined, undefined);

    const { roles, permissions } = await this.roleService.getRolesAndPermissions(newUser.id);

    const safeUser: SafeUser = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      displayName: newUser.displayName,
      totpEnabled: newUser.totpEnabled,
      isActive: newUser.isActive,
      emailVerified: newUser.emailVerified,
      phoneNumber: newUser.phoneNumber,
      phoneVerified: newUser.phoneVerified,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,

      roles: roles,
      permissions: Array.from(permissions),
    };

    await this.db.insert(credentials).values({
      userId: newUser.id,
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports || [],
      deviceName: "Passkey Authenticator",
    });

    // Logging with specific metadata for passkeys
    await this.logAuthEvent({
      userId: newUser.id,
      event: "registration",
      method: "passkey",
      metadata: JSON.stringify({ credentialId: credential.id, assignedRole: roleToAssign }),
    });
    this.afterResponse(this.sendEmailVerification(newUser));
    this.user = safeUser;

    // The caller opens the session (createSession), as for every other method.
    return {
      user: safeUser,
      requiresVerification: this.authConfig.security.requireEmailVerification,
      verified: true,
    };
  }

  // ==========================================
  // PASSKEY: LOGIN
  // ==========================================

  async generatePasskeyLoginOptions(rawEmail: string) {
    if (!this.isMethodEnabled("passkey")) throw new Error("Passkey login is not enabled.");

    // One answer for an unknown email, an account with no passkey and a
    // deactivated one, as for a wrong password: anything more specific tells
    // a stranger which addresses have accounts here.
    const email = this.normaliseEmail(rawEmail);
    const user = await this.db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !user.isActive) throw new Error(PASSKEY_SIGN_IN_FAILED);

    const userAuths = await this.db
      .select()
      .from(credentials)
      .where(eq(credentials.userId, user.id))
      .all();

    if (userAuths.length === 0) throw new Error(PASSKEY_SIGN_IN_FAILED);

    const options = await generateAuthenticationOptions({
      rpID: this.c.env.RP_ID,
      allowCredentials: userAuths.map((auth: any) => ({
        id: auth.credentialId,
        transports: auth.transports
          ? (auth.transports as AuthenticatorTransportFuture[])
          : undefined,
      })),
      userVerification: "preferred",
    });

    const challengeId = await this.setChallenge(options.challenge);
    return { options, challengeId };
  }

  async verifyPasskeyLogin(
    rawEmail: string,
    response: AuthenticationResponseJSON,
    challengeId: string,
  ) {
    const expectedChallenge = await this.getChallenge(challengeId);
    if (!expectedChallenge) throw new Error("Login session expired. Please try again.");

    const email = this.normaliseEmail(rawEmail);
    const user = await this.db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !user.isActive) throw new Error(PASSKEY_SIGN_IN_FAILED);
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new Error("Account is temporarily locked");
    }

    // The passkey must be this account's own. Looked up by its id alone, any
    // valid passkey on the site — the attacker's own — would sign them in as
    // whichever email they typed.
    const pass = await this.db
      .select()
      .from(credentials)
      .where(and(eq(credentials.credentialId, response.id), eq(credentials.userId, user.id)))
      .get();

    if (!pass) throw new Error(PASSKEY_SIGN_IN_FAILED);

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.c.env.ORIGIN,
        expectedRPID: this.c.env.RP_ID,
        credential: {
          id: pass.credentialId,
          publicKey: isoBase64URL.toBuffer(pass.publicKey),
          counter: pass.counter,
          transports: pass.transports as AuthenticatorTransportFuture[],
        },
      });
    } catch (error) {
      console.error(error);
      throw new Error("Verification calculation failed.");
    }

    if (!verification.verified) throw new Error("Verification failed.");

    await this.db
      .update(credentials)
      .set({
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date().toISOString(),
      })
      .where(eq(credentials.id, pass.id));
    await this.db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date().toISOString() })
      .where(eq(users.id, user.id));

    await this.logAuthEvent({
      userId: user.id,
      event: "login",
      method: "passkey",
      metadata: JSON.stringify({ credentialId: pass.credentialId }),
    });

    const safeUser = await this.toSafeUser(user);
    this.user = safeUser;
    return { user: safeUser };
  }

  // ==========================================
  // EMAIL LINKS: CONFIRMATION AND RESET
  // ==========================================

  /** A display name for emails: APP_NAME, else the host links point at. */
  private siteName() {
    return this.c.env.APP_NAME || new URL(this.linkTo("/")).hostname;
  }

  /**
   * An absolute link for an email, on ORIGIN. Not on the request's Host
   * header: that is the sender's to choose, and a reset link pointed at their
   * host would hand them the token.
   */
  private linkTo(path: string) {
    return new URL(path, this.c.env.ORIGIN || new URL(this.c.req.url).origin).toString();
  }

  /**
   * Issue a one-time link token for an account, retiring any earlier one of
   * the same type, so only the newest link in the inbox works. Stored as a
   * hash: a token in the clear would be a password equivalent for anyone who
   * can read the table.
   *
   * Null when one was issued in the last minute. The per-IP limiter allows
   * twenty requests a minute, which is plenty to fill somebody else's inbox
   * from a form that takes any address; this is the per-account stop.
   */
  private async issueLinkToken(userId: string, type: LinkTokenType, ttl: number) {
    const recent = await this.db
      .select({ id: verificationCodes.id })
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.userId, userId),
          eq(verificationCodes.type, type),
          gt(verificationCodes.createdAt, new Date(Date.now() - LINK_COOLDOWN).toISOString()),
        ),
      )
      .get();
    if (recent) return null;

    await this.db
      .delete(verificationCodes)
      .where(and(eq(verificationCodes.userId, userId), eq(verificationCodes.type, type)));

    const token = randomString(32); // 128 bits, hex
    await this.db.insert(verificationCodes).values({
      userId,
      type,
      code: await hashToken(token),
      expiresAt: new Date(Date.now() + ttl).toISOString(),
      // ISO, like expiresAt, so the cooldown above compares like with like.
      createdAt: new Date().toISOString(),
    });
    return token;
  }

  /**
   * Spend a link token. The row is deleted in the same statement that finds
   * it, so a link works once even when two tabs race to use it.
   */
  private async consumeLinkToken(token: string, type: LinkTokenType) {
    const [row] = await this.db
      .delete(verificationCodes)
      .where(
        and(
          eq(verificationCodes.code, await hashToken(token)),
          eq(verificationCodes.type, type),
          gt(verificationCodes.expiresAt, new Date().toISOString()),
        ),
      )
      .returning({ userId: verificationCodes.userId });
    return row as { userId: string | null } | undefined;
  }

  /**
   * Email a link that confirms the account's address. Sent on sign-up, and
   * again on request from /verify-email and the profile. Resolves to what
   * happened, so whoever asked can be told.
   */
  async sendEmailVerification(user: {
    id: string;
    email: string | null;
    emailVerified?: boolean | null;
  }): Promise<"sent" | "verified" | "too_soon" | "unavailable"> {
    if (user.emailVerified) return "verified";
    if (!user.email || !emailFlowsAvailable(this.c.env)) return "unavailable";

    const token = await this.issueLinkToken(user.id, "email_verify", VERIFY_LINK_TTL);
    if (!token) return "too_soon";

    const site = this.siteName();
    const sent = await sendEmail(
      this.c.env,
      linkEmail({
        to: user.email,
        subject: `Confirm your email for ${site}`,
        intro: `Confirm that ${user.email} is your address on ${site}. The link works once, within a day.`,
        action: "Confirm my email",
        url: this.linkTo(`/verify-email?token=${token}`),
        outro: `If you did not sign up to ${site}, ignore this email.`,
      }),
    );
    if (sent) {
      await this.logAuthEvent({
        userId: user.id,
        event: "email_verification_sent",
        method: "email",
      });
    }
    return sent ? "sent" : "unavailable";
  }

  /** Spend a confirmation link: the address it was sent to is confirmed. */
  async verifyEmail(token: string) {
    const spent = await this.consumeLinkToken(token, "email_verify");
    if (!spent?.userId) {
      throw new Error("This link is not valid: it may have expired or been used already.");
    }

    await this.db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date().toISOString() })
      .where(eq(users.id, spent.userId));
    if (this.user?.id === spent.userId) this.user = { ...this.user, emailVerified: true };

    await this.logAuthEvent({ userId: spent.userId, event: "email_verified", method: "email" });
    return { userId: spent.userId };
  }

  // ==========================================
  // AUTH LOGS
  // ==========================================

  async getAuthLogs(query?: {
    event?: string;
    method?: string;
    startDate?: string;
    limit?: number;
    offset?: number;
  }) {
    if (!this.user) {
      throw new Error("Not authenticated");
    }

    const conditions = [eq(authLogs.userId, this.user.id)];

    if (query?.event) {
      conditions.push(eq(authLogs.event, query.event));
    }

    if (query?.method) {
      conditions.push(eq(authLogs.method, query.method));
    }

    if (query?.startDate) {
      conditions.push(gt(authLogs.createdAt, query.startDate));
    }

    const logs = await this.db
      .select()
      .from(authLogs)
      .where(and(...conditions))
      .orderBy(desc(authLogs.createdAt))
      .limit(query?.limit || 50)
      .offset(query?.offset || 0);

    return logs;
  }
}
