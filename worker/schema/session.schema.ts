// worker/schema/session.schema.ts
import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth.schema";

const genId = () => crypto.randomUUID();

/**
 * One row per signed-in device.
 *
 * The session cookie is still a signed JWT, but it now carries a `jti` naming
 * a row here, and that row is what decides whether the session is live. The
 * token alone used to be the whole answer, which meant nothing could take it
 * back: signing out deleted the cookie and no more, so a token copied before
 * logout kept full access until it expired — days, by default. Changing a
 * password did not end the sessions of whoever had learned the old one.
 *
 * A row per device also gives the things a user expects to be able to do:
 * see where they are signed in, end one of those sessions without ending the
 * rest, and sign out everywhere after losing a laptop.
 *
 * The cost is one indexed lookup per request, next to the user lookup that
 * already happens. That is the price of being able to say no.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    /** Hard stop. Independent of the JWT's own `exp`, and the one that counts. */
    expiresAt: text("expires_at").notNull(),

    /** Set when revoked; a non-null value refuses the session from then on. */
    revokedAt: text("revoked_at"),

    /** Why it ended, for the "where am I signed in" screen and the audit log. */
    revokedReason: text("revoked_reason"),

    /** Updated as the session is used, so idle devices are recognisable. */
    lastSeenAt: text("last_seen_at")
      .default(sql`(current_timestamp)`)
      .notNull(),

    // Recorded at sign-in so a user can tell their own sessions apart. Both
    // are client-controlled and only ever displayed — never trusted.
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    createdAt: text("created_at")
      .default(sql`(current_timestamp)`)
      .notNull(),
  },
  (table) => [
    // Every request validates a session, and pruning/listing is per user.
    index("sessions_user_idx").on(table.userId),
    index("sessions_expires_idx").on(table.expiresAt),
  ],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const selectSessionSchema = createSelectSchema(sessions);

/** What a session looks like on the "signed in on these devices" screen. */
export const sessionSummarySchema = selectSessionSchema
  .pick({
    id: true,
    createdAt: true,
    lastSeenAt: true,
    expiresAt: true,
    ipAddress: true,
    userAgent: true,
  })
  .extend({ current: z.boolean() });

export type Session = z.infer<typeof selectSessionSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
