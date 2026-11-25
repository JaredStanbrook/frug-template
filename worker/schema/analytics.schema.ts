// worker/schema/analytics.schema.ts
//
// First-party analytics: one row per page view or form sent, recorded only
// for visitors who have allowed performance cookies (worker/lib/consent.ts).
// Nothing here leaves the site's own database.
//
// A visitor is a random id in the `_fa_vid` cookie (a year); a session is a
// random id in `_fa_sid` (30 minutes, renewed with each page). A signed-in
// visitor's rows also carry their user id, so an admin can follow their way
// through the site; deleting the account keeps the rows but drops the link.
//
// What is never stored: the full user-agent string, the IP address, query
// strings, or anything typed into a form. A form row records only where the
// form was sent.

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

import { users } from "./auth.schema";

export const ANALYTICS_KINDS = ["view", "form"] as const;
export type AnalyticsKind = (typeof ANALYTICS_KINDS)[number];

export const analyticsEvent = sqliteTable(
  "analytics_event",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    visitorId: text("visitor_id").notNull(),
    sessionId: text("session_id").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** "view": a page was shown. "form": a form on `path` was sent to `target`. */
    kind: text("kind", { enum: ANALYTICS_KINDS }).notNull(),
    /** The page, without its query string. */
    path: text("path").notNull(),
    /** For a form: the path it was sent to. */
    target: text("target"),
    /** Where the visitor came from: another site's host, or utm_source. Null: direct, or this site. */
    source: text("source"),
    device: text("device"), // "mobile" | "tablet" | "desktop"
    browser: text("browser"),
    os: text("os"),
    /** Two-letter country, from Cloudflare's edge. */
    country: text("country"),
    /** How long the page took to load, in ms: the full load, or the HTMX swap. */
    loadMs: integer("load_ms"),
    /** How long the page stayed in view, in ms. Filled in when the visitor moves on. */
    timeOnPageMs: integer("time_on_page_ms"),
    createdAt: text("created_at")
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .notNull(),
  },
  (table) => [
    index("analytics_event_created_idx").on(table.createdAt),
    index("analytics_event_session_idx").on(table.sessionId),
    index("analytics_event_user_idx").on(table.userId),
  ],
);

export type SelectAnalyticsEvent = typeof analyticsEvent.$inferSelect;
