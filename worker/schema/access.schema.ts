// worker/schema/access.schema.ts
//
// Invitation links for a site that is not public yet. While ACCESS_GATE is
// on, a visitor sees the gated pages only after opening one of these. See worker/services/access-gate.service.ts for the two modes.

import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { users } from "./auth.schema";
import { timestampColumns } from "./common";

export const accessLink = sqliteTable(
  "access_link",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** The secret in the URL. 256 random bits, so it cannot be guessed. */
    token: text("token").notNull(),
    /** Who it was sent to. Only an admin ever sees it. */
    label: text("label").notNull(),
    /** How long it lasts once opened. The clock does not start on creation. */
    durationHours: integer("duration_hours").notNull(),
    /** Null until the first visit, which also sets `expiresAt`. */
    firstVisitedAt: text("first_visited_at"),
    expiresAt: text("expires_at"),
    /**
     * "session" mode only: the cookie value minted when the link is opened,
     * so the link itself is spent. Null in "link" mode, where the cookie
     * holds the link token and the link keeps working until it expires.
     */
    sessionToken: text("session_token"),
    /** Set to end a link early. A revoked link refuses its holder at once. */
    revokedAt: text("revoked_at"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestampColumns,
  },
  (table) => [uniqueIndex("access_link_token_idx").on(table.token)],
);

// ==========================================
// VALIDATION
// ==========================================

export const selectAccessLinkSchema = createSelectSchema(accessLink);

/** The lengths the admin form offers, in hours. */
export const ACCESS_DURATIONS = [
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
  { hours: 336, label: "14 days" },
  { hours: 720, label: "30 days" },
] as const;

export const accessLinkFormSchema = z.object({
  label: z.string().trim().min(1, "Say who the link is for").max(120),
  durationHours: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 90),
});

// ==========================================
// TYPES
// ==========================================

export type SelectAccessLink = z.infer<typeof selectAccessLinkSchema>;
export type AccessLinkForm = z.infer<typeof accessLinkFormSchema>;
export type AccessLinkState = "unused" | "active" | "expired" | "revoked";
