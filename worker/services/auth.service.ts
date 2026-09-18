// worker/services/auth.service.ts
import { eq, and, or, gt, desc } from "drizzle-orm";
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
import { hashPassword, verifyPassword, randomString } from "../lib/crypto";
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
import { RoleService } from "./roles.service";
import type { Context } from "hono";
import { sign } from "hono/jwt";
import { setCookie, deleteCookie } from "hono/cookie";
import * as OTPAuth from "otpauth";

/**
 * Signing algorithm for the session JWT. `sign` defaults to HS256; `verify`
 * takes it explicitly, so keep both reading from this constant — a mismatch
 * silently rejects every session.
 */
const JWT_ALG = "HS256" as const;

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
      // 1. Verify Token (Throws error if invalid/expired)
      const payload = await verify(token, this.authConfig.security.jwtSecret, JWT_ALG);
      const userId = payload.sub as string;

      // 2. Fetch User (Destructuring the array [user])
      // Note: Ensure you use 'this.db', not global 'db'
      const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user) {
        return { user: null };
      }

      // Deactivating an account has to end the sessions it already has, or it
      // only stops the next sign-in — someone already holding a token keeps
      // full access until it expires, which can be days.
      if (!user.isActive) {
        return { user: null };
      }

      // 3. Strip secrets and hydrate roles/permissions
      const safeUser = await this.toSafeUser(user);

      // 4. Update Class State
      this.user = safeUser;

      // In stateless JWT, we usually don't have a session ID unless we track jti
      // We can just store the token itself if needed
      // this.session = { id: token };

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
  async createSession(user: { id: string; roles: string[] }) {
    const secret = this.authConfig.security.jwtSecret;
    const expiresIn = this.authConfig.security.jwtExpiry;

    const payload = {
      sub: user.id,
      role: user.roles,
      exp: Math.floor(Date.now() / 1000) + expiresIn,
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
      maxAge: expiresIn,
    });

    return { token, user };
  }

  async destroySession() {
    const isHttps =
      this.c.req.url.startsWith("https://") || this.c.req.header("x-forwarded-proto") === "https";
    deleteCookie(this.c, "auth_token", {
      path: "/",
      secure: isHttps,
    });
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
    this.validateRegistrationEligibility(data.email);

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
    const existingUser = await this.db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .get();

    if (existingUser) throw new Error("Email already registered");

    const userData: InsertUser = {
      username: data.username,
      email: data.email,
      displayName: data.displayName,
      phoneNumber: data.phoneNumber,
    };

    if (data.password && this.isMethodEnabled("password")) {
      userData.passwordHash = await hashPassword(data.password);
    }

    if (data.pin && this.isMethodEnabled("pin")) {
      userData.pin = await hashPassword(data.pin);
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

    if (this.authConfig.security.requireEmailVerification && data.email) {
      // TODO: Implement sendVerificationCode
    }
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
      .where(or(eq(users.username, identifier), eq(users.email, identifier)))
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
      .where(or(eq(users.username, identifier), eq(users.email, identifier)))
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
      .where(or(eq(users.username, identifier), eq(users.email, identifier)))
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
  async requestPasswordReset(email: string) {
    const user = await this.db.select().from(users).where(eq(users.email, email)).get();
    if (!user) return;

    const code = randomString(32);
    const expiresAt = new Date(Date.now() + 3600000);

    await this.db.insert(verificationCodes).values({
      userId: user.id,
      code,
      type: "password_reset",
      expiresAt: expiresAt.toISOString(),
    });

    // Logging the request itself is often useful
    await this.logAuthEvent({
      userId: user.id,
      event: "password_reset_request",
      method: "email",
    });

    console.log(`Password reset code for ${email}: ${code}`);
  }

  async resetPassword(token: string, newPassword: string) {
    const verification = await this.db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.code, token),
          eq(verificationCodes.type, "password_reset"),
          gt(verificationCodes.expiresAt, new Date().toISOString()),
        ),
      )
      .get();

    if (!verification) throw new Error("Invalid or expired reset token");

    const newHash = await hashPassword(newPassword);
    await this.db
      .update(users)
      .set({ passwordHash: newHash })
      .where(eq(users.id, verification.userId));

    await this.db.delete(verificationCodes).where(eq(verificationCodes.id, verification.id));

    await this.logAuthEvent({
      userId: verification.userId,
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

    // 3. Hash NEW password
    const newHash = await hashPassword(data.newPassword);

    // 4. Update DB
    await this.db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

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

  async generatePasskeyRegistrationOptions(email: string) {
    if (!this.isMethodEnabled("passkey")) throw new Error("Passkey registration is not enabled.");

    this.validateRegistrationEligibility(email);

    const existingUser = await this.db.select().from(users).where(eq(users.email, email)).get();

    if (existingUser) throw new Error("Email already registered");

    const tempUserId = crypto.randomUUID();
    const options = await generateRegistrationOptions({
      rpName: this.c.env.RP_NAME,
      rpID: this.c.env.RP_ID,
      userID: isoUint8Array.fromUTF8String(tempUserId),
      userName: email,
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
    email: string,
    role: string | undefined,
    response: RegistrationResponseJSON,
    challengeId: string,
  ) {
    this.validateRegistrationEligibility(email);

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

    const sessionToken = await this.createSession(newUser.id);

    // Logging with specific metadata for passkeys
    await this.logAuthEvent({
      userId: newUser.id,
      event: "registration",
      method: "passkey",
      metadata: JSON.stringify({ credentialId: credential.id, assignedRole: roleToAssign }),
    });
    if (this.authConfig.security.requireEmailVerification && email) {
      // TODO: Implement sendVerificationCode
    }
    this.user = safeUser;

    return {
      user: safeUser,
      requiresVerification: this.authConfig.security.requireEmailVerification,
      verified: true,
      sessionToken,
    };
  }

  // ==========================================
  // PASSKEY: LOGIN
  // ==========================================

  async generatePasskeyLoginOptions(email: string) {
    if (!this.isMethodEnabled("passkey")) throw new Error("Passkey login is not enabled.");

    const user = await this.db.select().from(users).where(eq(users.email, email)).get();
    if (!user) throw new Error("No account found with this email.");

    const userAuths = await this.db
      .select()
      .from(credentials)
      .where(eq(credentials.userId, user.id))
      .all();

    if (userAuths.length === 0) throw new Error("No passkeys registered for this account.");

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
    email: string,
    response: AuthenticationResponseJSON,
    challengeId: string,
  ) {
    const expectedChallenge = await this.getChallenge(challengeId);
    if (!expectedChallenge) throw new Error("Login session expired. Please try again.");

    const user = await this.db.select().from(users).where(eq(users.email, email)).get();
    if (!user) throw new Error("User not found.");

    const pass = await this.db
      .select()
      .from(credentials)
      .where(eq(credentials.credentialId, response.id))
      .get();

    if (!pass) throw new Error("Passkey not recognized.");

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
  // VERIFICATION
  // ==========================================

  async sendVerificationCode(type: "email" | "sms") {
    if (!this.user) throw new Error("Not authenticated");

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 600000);

    await this.db.insert(verificationCodes).values({
      userId: this.user.id,
      code,
      type,
      expiresAt: expiresAt.toISOString(),
    });

    await this.logAuthEvent({
      userId: this.user.id,
      event: `${type}_code_sent`,
      method: type,
    });

    if (type === "email") {
      console.log(`Email verification code for ${this.user.email}: ${code}`);
    } else if (type === "sms") {
      console.log(`SMS verification code for ${this.user.phoneNumber}: ${code}`);
    }

    return { sent: true };
  }

  async verifyCode(code: string, type: "email" | "sms" | "password_reset") {
    if (!this.user) throw new Error("Not authenticated");

    const verification = await this.db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.userId, this.user.id),
          eq(verificationCodes.code, code),
          eq(verificationCodes.type, type),
          gt(verificationCodes.expiresAt, new Date().toISOString()),
        ),
      )
      .get();

    if (!verification) throw new Error("Invalid or expired code");

    if (type === "email") {
      await this.db.update(users).set({ emailVerified: true }).where(eq(users.id, this.user.id));
    } else if (type === "sms") {
      await this.db.update(users).set({ phoneVerified: true }).where(eq(users.id, this.user.id));
    }

    await this.db.delete(verificationCodes).where(eq(verificationCodes.id, verification.id));

    await this.logAuthEvent({
      userId: this.user.id,
      event: `${type}_verified`,
      method: type,
    });

    return true;
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
