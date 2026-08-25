// worker/schema/auth.schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations, sql } from "drizzle-orm";
import { z } from "zod";

// Helper for generating UUIDs
const genId = () => crypto.randomUUID();
// Helper for Base64URL strings
const base64UrlString = z.string().regex(/^[a-zA-Z0-9_-]+$/, "Invalid Base64URL");

/**
 * Core users table
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(genId),
  username: text("username").unique(),
  email: text("email").unique(),
  displayName: text("display_name"),

  // Conditional auth fields
  passwordHash: text("password_hash"),
  pin: text("pin"),
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).default(false),

  // Account management (SQLite uses integer 0/1 for booleans)
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false),
  phoneNumber: text("phone_number"),
  phoneVerified: integer("phone_verified", { mode: "boolean" }).default(false),

  // Security
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"),

  // Timestamps
  createdAt: text("created_at")
    .default(sql`(current_timestamp)`)
    .notNull(),
  updatedAt: text("updated_at")
    .$onUpdate(() => sql`(current_timestamp)`)
    .notNull(),
});

/**
 * passkey credentials
 */
export const credentials = sqliteTable("credentials", {
  id: text("id").primaryKey().$defaultFn(genId),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull(),
  deviceName: text("device_name"),
  transports: text("transports", { mode: "json" }).$type<string[]>(),
  createdAt: text("created_at")
    .default(sql`(current_timestamp)`)
    .notNull(),
  lastUsedAt: text("last_used_at"),
});

/**
 * Sessions table
 */
const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey().$defaultFn(genId),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  secretHash: text("secret_hash").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .default(sql`(current_timestamp)`)
    .notNull(),
  lastActivityAt: text("last_activity_at")
    .default(sql`(current_timestamp)`)
    .notNull(),
});

/**
 * Email/SMS verification codes
 */
export const verificationCodes = sqliteTable("verification_codes", {
  id: text("id").primaryKey().$defaultFn(genId),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  type: text("type").notNull(), // 'email', 'sms', 'totp'
  expiresAt: text("expires_at").notNull(),
  verified: integer("verified", { mode: "boolean" }).default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

/**
 * Audit log
 */
export const authLogs = sqliteTable("auth_logs", {
  id: text("id").primaryKey().$defaultFn(genId),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  method: text("method"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: text("metadata", { mode: "json" }), // Stored as text, parsed as JSON
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// Relations remain largely the same
export const usersRelations = relations(users, ({ many }) => ({
  credentials: many(credentials),
  sessions: many(sessions),
  verificationCodes: many(verificationCodes),
  authLogs: many(authLogs),
}));

export const credentialsRelations = relations(credentials, ({ one }) => ({
  user: one(users, {
    fields: [credentials.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

/**
 * Zod schema for inserting a user (input validation)
 */
export const insertUserSchema = createInsertSchema(users, {
  // storing a UUID string.
  id: z.uuid().optional(),
  // Dates are automatically mapped to z.date() when using mode: 'timestamp'
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  lastLoginAt: z.date().optional(),
  lockedUntil: z.date().optional(),

  email: z.email(),
});

/**
 * Zod schema for selecting a user (output shape)
 */
export const selectUserSchema = createSelectSchema(users).omit({
  passwordHash: true,
  totpSecret: true,
  pin: true,
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});
export const loginUserSchema = z.object({
  email: z.email(),
  password: z.string().optional(),
  pin: z.string().min(4).max(10).optional(),
  totpCode: z.string().min(6).max(6).optional(),
});
export const registerUserSchema = insertUserSchema.extend({
  password: z.string().min(8).optional(),
  totpCode: z.string().min(6).max(6).optional(),

  role: z.string().optional(),
});
export const safeUserSchema = selectUserSchema.extend({
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export const userSummarySchema = selectUserSchema.pick({
  id: true,
  email: true,
  displayName: true,
});
/**
 * The user shape passed into layout and nav components. Extend this if the
 * shell needs more than identity and permissions on every page.
 */
export const propsUserSchema = selectUserSchema.extend({
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});

export const updateUserProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  phoneNumber: z.string().min(10).max(15).optional(), // Simple validation
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const changePinRequestSchema = z.object({
  currentPin: z.string(),
  newPin: z.string().min(4).max(10), // Adjust based on your config
});
// ==========================================
// 🔐 PassKey
// ==========================================
export const registerPasskeyOptionsSchema = z.object({
  email: z.email(),
});

// Strictly typed Registration Response
export const registerPasskeyVerifySchema = z.object({
  email: z.email(),
  role: z.string().optional(),
  challengeId: z.string().min(1),
  response: z.object({
    id: base64UrlString,
    rawId: base64UrlString,
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: base64UrlString,
      attestationObject: base64UrlString,
      transports: z.array(z.string()).optional(),
    }),
    // Change z.object({}) to z.any() to allow WebAuthn extension data
    clientExtensionResults: z.any().optional(),
    authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  }),
});

export const loginPasskeyOptionsSchema = z.object({
  email: z.email(),
});

// Strictly typed Authentication Response
export const loginPasskeyVerifySchema = z.object({
  email: z.email(),
  challengeId: z.string().min(1),
  response: z.object({
    id: base64UrlString,
    rawId: base64UrlString,
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: base64UrlString,
      authenticatorData: base64UrlString,
      signature: base64UrlString,
      userHandle: base64UrlString.optional(),
    }),
    // Change z.object({}) to z.any() here as well
    clientExtensionResults: z.any().optional(),
    authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  }),
});
// ==========================================
// 🔐 CREDENTIALS
// ==========================================

export const insertCredentialSchema = createInsertSchema(credentials, {
  createdAt: z.date().optional(),
  // Ensure transports is an array of strings
  transports: z.array(z.string()).optional(),
});
export const selectCredentialSchema = createSelectSchema(credentials);

// ==========================================
// 💻 SESSIONS
// ==========================================

export const insertSessionSchema = createInsertSchema(sessions, {
  createdAt: z.date().optional(),
  lastActivityAt: z.date().optional(),
  expiresAt: z.date(),
});
export const selectSessionSchema = createSelectSchema(sessions);

// ==========================================
// ✉️ VERIFICATION CODES
// ==========================================

export const insertVerificationCodeSchema = createInsertSchema(verificationCodes, {
  createdAt: z.date().optional(),
  expiresAt: z.date(),
});
export const selectVerificationCodeSchema = createSelectSchema(verificationCodes);

// ==========================================
// TOTP CODES
// ==========================================

export const setupTotpResponseSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
});

export const verifyTotpSchema = z.object({
  secret: z.string(),
  code: z.string().length(6),
});

// ==========================================
// 📜 AUTH LOGS
// ==========================================

export const insertAuthLogSchema = createInsertSchema(authLogs, {
  createdAt: z.date().optional(),
});
export const selectAuthLogSchema = createSelectSchema(authLogs);

// ==========================================
// TYPE EXPORTS
// ==========================================

export type InsertUser = z.infer<typeof insertUserSchema>;
export type SelectUser = z.infer<typeof selectUserSchema>;
export type RegisterUser = z.infer<typeof registerUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
export type SafeUser = z.infer<typeof safeUserSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type PropsUser = z.infer<typeof propsUserSchema>;
export type RegisterPasskeyVerify = z.infer<typeof registerPasskeyVerifySchema>;
export type LoginPasskeyVerify = z.infer<typeof loginPasskeyVerifySchema>;
export type ChangePassword = z.infer<typeof changePasswordSchema>;
export type VerifyTotp = z.infer<typeof verifyTotpSchema>;

export type InsertCredential = z.infer<typeof insertCredentialSchema>;
export type SelectCredential = z.infer<typeof selectCredentialSchema>;

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type SelectSession = z.infer<typeof selectSessionSchema>;

export type InsertVerificationCode = z.infer<typeof insertVerificationCodeSchema>;
export type SelectVerificationCode = z.infer<typeof selectVerificationCodeSchema>;

export type InsertAuthLog = z.infer<typeof insertAuthLogSchema>;
export type SelectAuthLog = z.infer<typeof selectAuthLogSchema>;
