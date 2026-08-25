// ---------------------------------------------------------------------------
// EXAMPLE FEATURE — see worker/schema/note.schema.ts.
//
// A complete vertical slice: guarded routes, Zod-validated forms, ownership
// enforced through AccessControl, soft deletes, and HTMX fragment responses.
// Copy this file's shape for a real feature, then delete it.
// ---------------------------------------------------------------------------

import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";

import type { AppEnv } from "@server/types";
import { note, noteFormSchema } from "@server/schema/note.schema";
import { requireUser } from "@server/middleware/guard.middleware";
import { AccessControl } from "@server/services/access.service";
import { htmxResponse, htmxToast, flashToast } from "@server/lib/htmx-helpers";
import { NoteListPage, NoteFormPage } from "@views/notes/NoteComponents";

export const notesRoute = new Hono<AppEnv>();

const access = new AccessControl();

// Every route below needs a signed-in user.
notesRoute.use("*", requireUser);

/** Scope every read to the signed-in user and skip soft-deleted rows. */
const ownedBy = (userId: string) => and(eq(note.userId, userId), isNull(note.deletedAt));

// ==========================================
// LIST
// ==========================================
notesRoute.get("/", async (c) => {
  const user = c.var.auth.user!;
  access.authorize(user, "notes", "read");

  const notes = await c.var.db
    .select()
    .from(note)
    .where(ownedBy(user.id))
    .orderBy(desc(note.pinned), desc(note.updatedAt));

  return htmxResponse(
    c,
    "Notes",
    <NoteListPage
      notes={notes}
      locale={c.var.app.locale}
      canCreate={user.permissions.includes("notes.create") || user.roles.includes("admin")}
    />,
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
