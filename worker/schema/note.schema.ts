// worker/schema/note.schema.ts
//
// ---------------------------------------------------------------------------
// EXAMPLE FEATURE — delete this file (and routes/notes.tsx, views/notes/) once
// you have a real domain. It exists to show the shape every feature follows:
//
//   1. A Drizzle table, owned by a user via `ownershipColumns`.
//   2. Zod schemas derived from that table with drizzle-zod.
//   3. Inferred TypeScript types exported for routes and views.
//
// Soft deletes (`deletedAt`) are the house convention: rows are filtered with
// `isNull(note.deletedAt)` rather than removed, so audit history survives.
// ---------------------------------------------------------------------------

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

import { users } from "./auth.schema";
import { ownershipColumns } from "./common";

/**
 * Accent slots, not colour names.
 *
 * Each maps to a `chart-*` theme token in the view layer, so a note's colour
 * follows the active theme instead of being a fixed hex that only reads well
 * in one mode. Storing the slot rather than the colour means a re-theme
 * restyles every existing note for free.
 */
export const NOTE_ACCENTS = ["neutral", "1", "2", "3", "4", "5"] as const;
export type NoteAccent = (typeof NOTE_ACCENTS)[number];

export const note = sqliteTable(
  "note",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    body: text("body"),
    pinned: integer("pinned", { mode: "boolean" }).default(false).notNull(),
    accent: text("accent", { enum: NOTE_ACCENTS }).default("neutral").notNull(),
    deletedAt: text("deleted_at"),
    ...ownershipColumns,
  },
  (table) => [index("note_user_idx").on(table.userId)],
);

export const noteRelations = relations(note, ({ one }) => ({
  owner: one(users, {
    fields: [note.userId],
    references: [users.id],
  }),
}));

// ==========================================
// VALIDATION
// ==========================================

export const insertNoteSchema = createInsertSchema(note, {
  title: z.string().min(1, "Title is required").max(120),
  body: z.string().max(10_000).optional(),
});

export const selectNoteSchema = createSelectSchema(note);

/** What an HTMX form posts. Ownership and timestamps are server-assigned. */
export const noteFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
  body: z.string().max(10_000).optional().default(""),
  // An unchecked checkbox is absent from the body entirely, so this has to
  // tolerate `undefined` as well as the "on" the browser sends when ticked.
  pinned: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
  accent: z.enum(NOTE_ACCENTS).optional().default("neutral"),
});

/** Query string for the list view: live search plus a pinned-only toggle. */
export const noteFilterSchema = z.object({
  q: z.string().max(120).optional().default(""),
  pinned: z
    .union([z.literal("1"), z.literal("")])
    .optional()
    .transform((v) => v === "1"),
});

// ==========================================
// TYPES
// ==========================================

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type SelectNote = z.infer<typeof selectNoteSchema>;
export type NoteForm = z.infer<typeof noteFormSchema>;
export type NoteFilter = z.infer<typeof noteFilterSchema>;
