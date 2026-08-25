// ---------------------------------------------------------------------------
// EXAMPLE FEATURE — see worker/schema/note.schema.ts.
//
// A complete vertical slice: guarded routes, Zod-validated forms, ownership
// enforced through AccessControl, soft deletes, and HTMX fragment responses.
// Copy this file's shape for a real feature, then delete it.
// ---------------------------------------------------------------------------

import { Hono } from "hono";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";

import type { AppEnv } from "@server/types";
import { note, noteFormSchema, noteFilterSchema } from "@server/schema/note.schema";
import { requireUser } from "@server/middleware/guard.middleware";
import { AccessControl } from "@server/services/access.service";
import { htmxResponse, htmxToast, flashToast } from "@server/lib/htmx-helpers";
import { NoteListPage, NoteGrid, NoteFormPage } from "@views/notes/NoteComponents";

export const notesRoute = new Hono<AppEnv>();

const access = new AccessControl();

// Every route below needs a signed-in user.
notesRoute.use("*", requireUser);

/** Scope every read to the signed-in user and skip soft-deleted rows. */
const ownedBy = (userId: string) => and(eq(note.userId, userId), isNull(note.deletedAt));

// ==========================================
// LIST  (also serves live search)
// ==========================================
notesRoute.get("/", zValidator("query", noteFilterSchema), async (c) => {
  const user = c.var.auth.user!;
  access.authorize(user, "notes", "read");

  const { q, pinned } = c.req.valid("query");

  // `%` and `_` are LIKE wildcards, so a search for "100%" would otherwise
  // match everything. Escaping them only works if the pattern also declares
  // an escape character — SQLite treats a backslash as an ordinary character
  // without the ESCAPE clause, which is why this uses raw sql rather than
  // Drizzle's `like()`.
  const term = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const matches = (column: typeof note.title | typeof note.body) =>
    sql`${column} LIKE ${term} ESCAPE '\\'`;

  const filters = and(
    ownedBy(user.id),
    pinned ? eq(note.pinned, true) : undefined,
    q ? or(matches(note.title), matches(note.body)) : undefined,
  );

  const [notes, all] = await Promise.all([
    c.var.db.select().from(note).where(filters).orderBy(desc(note.pinned), desc(note.updatedAt)),
    // Unfiltered counts, so the header and the pinned toggle keep showing the
    // totals rather than collapsing to the size of the current result set.
    c.var.db.select({ pinned: note.pinned }).from(note).where(ownedBy(user.id)),
  ]);

  // hx-boost makes every ordinary navigation an HTMX request too, so
  // HX-Request alone cannot tell "searching" from "arrived here by link".
  // The search form names its target, and only that gets the bare grid.
  const isGridSwap = c.req.header("HX-Target") === "note-grid";

  const props = {
    notes,
    locale: c.var.app.locale,
    query: q,
    pinnedOnly: pinned,
  };

  if (isGridSwap) return c.html(<NoteGrid {...props} />);

  return c.render(
    <NoteListPage
      {...props}
      total={all.length}
      pinnedCount={all.filter((n) => n.pinned).length}
      canCreate={user.permissions.includes("notes.create") || user.roles.includes("admin")}
    />,
    { title: "Notes" },
  );
});

// ==========================================
// CREATE
// ==========================================
notesRoute.get("/new", async (c) => {
  access.authorize(c.var.auth.user!, "notes", "create");
  return htmxResponse(c, "New note", <NoteFormPage />);
});

notesRoute.post("/", zValidator("form", noteFormSchema), async (c) => {
  const user = c.var.auth.user!;
  access.authorize(user, "notes", "create");

  const data = c.req.valid("form");

  await c.var.db.insert(note).values({
    title: data.title,
    body: data.body || null,
    pinned: data.pinned,
    accent: data.accent,
    userId: user.id,
    updatedAt: new Date().toISOString(),
  });

  flashToast(c, "Note created");
  return c.redirect("/notes");
});

// ==========================================
// UPDATE
// ==========================================
notesRoute.get("/:id/edit", async (c) => {
  const user = c.var.auth.user!;
  const id = Number(c.req.param("id"));

  const [existing] = await c.var.db
    .select()
    .from(note)
    .where(and(eq(note.id, id), isNull(note.deletedAt)));

  if (!existing) return c.notFound();
  access.authorize(user, "notes", "update", existing.userId);

  return htmxResponse(c, "Edit note", <NoteFormPage note={existing} />);
});

notesRoute.post("/:id", zValidator("form", noteFormSchema), async (c) => {
  const user = c.var.auth.user!;
  const id = Number(c.req.param("id"));
  const data = c.req.valid("form");

  const [existing] = await c.var.db
    .select()
    .from(note)
    .where(and(eq(note.id, id), isNull(note.deletedAt)));

  if (!existing) return c.notFound();
  access.authorize(user, "notes", "update", existing.userId);

  await c.var.db
    .update(note)
    .set({
      title: data.title,
      body: data.body || null,
      pinned: data.pinned,
      accent: data.accent,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(note.id, id));

  flashToast(c, "Note saved");
  return c.redirect("/notes");
});

// ==========================================
// DELETE (soft)
// ==========================================
notesRoute.delete("/:id", async (c) => {
  const user = c.var.auth.user!;
  const id = Number(c.req.param("id"));

  const [existing] = await c.var.db
    .select()
    .from(note)
    .where(and(eq(note.id, id), isNull(note.deletedAt)));

  if (!existing) return c.notFound();
  access.authorize(user, "notes", "delete", existing.userId);

  await c.var.db.update(note).set({ deletedAt: new Date().toISOString() }).where(eq(note.id, id));

  htmxToast(c, "Note deleted");
  // Empty body replaces the row this request targeted.
  return c.body(null, 200);
});
