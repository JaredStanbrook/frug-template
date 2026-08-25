// ---------------------------------------------------------------------------
// EXAMPLE FEATURE — see worker/schema/note.schema.ts.
//
// Views are pure functions of their props: no data access, no context. The
// route fetches, the view renders. Every fragment an HTMX request can target
// has a stable `id` so the route can swap it by selector.
// ---------------------------------------------------------------------------

import type { SelectNote } from "@server/schema/note.schema";
import { formatDateShort } from "@views/lib/utils";

interface NoteListProps {
  notes: SelectNote[];
  locale: string;
}

export const NoteRow = ({ note, locale }: { note: SelectNote; locale: string }) => (
  <tr class="border-b transition-colors hover:bg-muted/40" id={`note-${note.id}`}>
    <td class="p-4 align-top">
      <div class="flex items-start gap-2">
        {note.pinned ? (
          <i data-lucide="pin" class="h-4 w-4 mt-0.5 text-primary shrink-0"></i>
        ) : null}
        <div class="min-w-0">
          <p class="font-medium truncate">{note.title}</p>
          {note.body ? <p class="text-sm text-muted-foreground line-clamp-2">{note.body}</p> : null}
        </div>
      </div>
    </td>
    <td class="p-4 align-top whitespace-nowrap text-sm text-muted-foreground">
      {formatDateShort(note.updatedAt, locale)}
    </td>
    <td class="p-4 align-top text-right whitespace-nowrap">
      <a
        href={`/notes/${note.id}/edit`}
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-accent transition-colors"
      >
        <i data-lucide="pencil" class="h-3.5 w-3.5"></i> Edit
      </a>
      <button
        hx-delete={`/notes/${note.id}`}
        hx-target={`#note-${note.id}`}
        hx-swap="outerHTML swap:200ms"
        hx-confirm="Delete this note?"
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-destructive hover:bg-destructive/10 transition-colors"
      >
        <i data-lucide="trash-2" class="h-3.5 w-3.5"></i> Delete
      </button>
    </td>
  </tr>
);

export const NoteTable = ({ notes, locale }: NoteListProps) => (
  <div id="note-table" class="rounded-2xl border bg-card shadow-sm overflow-hidden">
    <div class="relative w-full overflow-auto">
      <table class="w-full caption-bottom text-sm">
        <thead class="[&_tr]:border-b bg-muted/40">
          <tr class="border-b text-left">
            <th class="h-12 px-4 align-middle font-medium text-muted-foreground">Note</th>
            <th class="h-12 px-4 align-middle font-medium text-muted-foreground">Updated</th>
            <th class="h-12 px-4 align-middle font-medium text-muted-foreground text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="[&_tr:last-child]:border-0 bg-card">
          {notes.length === 0 ? (
            <tr>
              <td colSpan={3} class="p-12 text-center text-muted-foreground">
                No notes yet. Create your first one.
              </td>
            </tr>
          ) : (
            notes.map((note) => <NoteRow note={note} locale={locale} />)
          )}
        </tbody>
      </table>
    </div>
  </div>
);

interface NotePageProps extends NoteListProps {
  canCreate: boolean;
}

export const NoteListPage = ({ notes, locale, canCreate }: NotePageProps) => (
  <div class="max-w-4xl mx-auto space-y-8 p-8 pt-20 animate-in fade-in duration-500">
    <div class="flex items-end justify-between gap-4">
      <div class="space-y-2">
        <h1 class="text-3xl font-bold tracking-tight">Notes</h1>
        <p class="text-muted-foreground">
          An example feature. Copy its shape for your own, then delete it.
        </p>
      </div>
      {canCreate ? (
        <a
          href="/notes/new"
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 h-10 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
        >
          <i data-lucide="plus" class="h-4 w-4"></i> New note
        </a>
      ) : null}
    </div>

    <NoteTable notes={notes} locale={locale} />
  </div>
);

interface NoteFormProps {
  note?: SelectNote;
  errors?: Record<string, string>;
}

export const NoteFormPage = ({ note, errors }: NoteFormProps) => {
  const isEdit = Boolean(note);
  const action = isEdit ? `/notes/${note!.id}` : "/notes";

  return (
    <div class="max-w-2xl mx-auto space-y-8 p-8 pt-20 animate-in fade-in duration-500">
      <div class="space-y-2">
        <h1 class="text-3xl font-bold tracking-tight">{isEdit ? "Edit note" : "New note"}</h1>
      </div>

      <form
        hx-post={action}
        hx-target="body"
        hx-swap="outerHTML"
        class="space-y-6 rounded-2xl border bg-card p-6 shadow-sm"
      >
        <div class="space-y-2">
          <label for="title" class="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            maxlength={120}
            value={note?.title ?? ""}
            class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {errors?.title ? <p class="text-sm text-destructive">{errors.title}</p> : null}
        </div>

        <div class="space-y-2">
          <label for="body" class="text-sm font-medium">
            Body
          </label>
          <textarea
            id="body"
            name="body"
            rows={8}
            class="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {note?.body ?? ""}
          </textarea>
          {errors?.body ? <p class="text-sm text-destructive">{errors.body}</p> : null}
        </div>

        <label class="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="pinned"
            checked={note?.pinned ?? false}
            class="h-4 w-4 rounded border-input"
          />
          Pin to the top of the list
        </label>

        <div class="flex items-center gap-3 pt-2">
          <button
            type="submit"
            class="inline-flex items-center justify-center rounded-lg bg-primary px-5 h-10 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {isEdit ? "Save changes" : "Create note"}
          </button>
          <a
            href="/notes"
            class="inline-flex items-center justify-center rounded-lg border border-input px-5 h-10 text-sm font-medium hover:bg-accent transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
};
