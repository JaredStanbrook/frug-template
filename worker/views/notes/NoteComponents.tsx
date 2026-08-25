// ---------------------------------------------------------------------------
// EXAMPLE FEATURE — see worker/schema/note.schema.ts.
//
// Views are pure functions of their props: no data access, no context. The
// route fetches, the view renders. Every fragment an HTMX request can target
// has a stable `id` so the route can swap it by selector.
// ---------------------------------------------------------------------------

import type { SelectNote, NoteAccent } from "@server/schema/note.schema";
import { NOTE_ACCENTS } from "@server/schema/note.schema";
import { formatDateShort } from "@views/lib/utils";

/**
 * Accent slot → theme tokens.
 *
 * Written out in full rather than composed (`bg-chart-${n}`) because Tailwind
 * scans source text for complete class names — an interpolated one is never
 * generated, and the colour silently goes missing.
 */
const ACCENTS: Record<NoteAccent, { bar: string; swatch: string; label: string }> = {
  neutral: { bar: "bg-border", swatch: "bg-muted-foreground/40", label: "Neutral" },
  "1": { bar: "bg-chart-1", swatch: "bg-chart-1", label: "Accent one" },
  "2": { bar: "bg-chart-2", swatch: "bg-chart-2", label: "Accent two" },
  "3": { bar: "bg-chart-3", swatch: "bg-chart-3", label: "Accent three" },
  "4": { bar: "bg-chart-4", swatch: "bg-chart-4", label: "Accent four" },
  "5": { bar: "bg-chart-5", swatch: "bg-chart-5", label: "Accent five" },
};

const accentOf = (note: SelectNote) => ACCENTS[note.accent as NoteAccent] ?? ACCENTS.neutral;

interface NoteListProps {
  notes: SelectNote[];
  locale: string;
  query: string;
  pinnedOnly: boolean;
}

// ==========================================
// CARD
// ==========================================

export const NoteCard = ({ note, locale }: { note: SelectNote; locale: string }) => {
  const accent = accentOf(note);

  return (
    <article
      id={`note-${note.id}`}
      class="group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
    >
      <div class={`h-1 w-full ${accent.bar}`}></div>

      <div class="flex flex-1 flex-col gap-2 p-5">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-medium leading-snug line-clamp-2 min-w-0">{note.title}</h3>
          {note.pinned ? (
            <i data-lucide="pin" class="h-4 w-4 shrink-0 text-primary" title="Pinned"></i>
          ) : null}
        </div>

        {note.body ? (
          <p class="text-sm text-muted-foreground line-clamp-4 whitespace-pre-line">{note.body}</p>
        ) : (
          <p class="text-sm italic text-muted-foreground/70">No details</p>
        )}

        <div class="mt-auto flex items-center justify-between gap-2 pt-4">
          <span class="text-tiny uppercase tracking-wider text-muted-foreground">
            {formatDateShort(note.updatedAt, locale)}
          </span>

          {/* Always visible rather than hover-only — there is no hover on touch. */}
          <div class="flex items-center gap-1">
            <a
              href={`/notes/${note.id}/edit`}
              aria-label={`Edit ${note.title}`}
              class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <i data-lucide="pencil" class="h-3.5 w-3.5"></i>
            </a>
            <button
              hx-delete={`/notes/${note.id}`}
              hx-target={`#note-${note.id}`}
              hx-swap="outerHTML swap:200ms"
              hx-confirm={`Delete "${note.title}"?`}
              aria-label={`Delete ${note.title}`}
              class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <i data-lucide="trash-2" class="h-3.5 w-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

// ==========================================
// GRID  (the HTMX swap target)
// ==========================================

const EmptyState = ({ query, pinnedOnly }: { query: string; pinnedOnly: boolean }) => {
  const filtered = Boolean(query) || pinnedOnly;

  return (
    <div class="col-span-full flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-muted/30 px-6 py-16 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <i
          data-lucide={filtered ? "search-x" : "notebook-pen"}
          class="h-5 w-5 text-muted-foreground"
        ></i>
      </div>
      <p class="font-medium">{filtered ? "Nothing matches that" : "No notes yet"}</p>
      <p class="max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Try a different search, or clear the filters to see everything."
          : "Create your first note and it will show up here."}
      </p>
      {filtered ? (
        <a
          href="/notes"
          class="mt-1 inline-flex items-center gap-2 rounded-lg border border-input px-4 h-9 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <i data-lucide="rotate-ccw" class="h-3.5 w-3.5"></i> Clear filters
        </a>
      ) : (
        <a
          href="/notes/new"
          class="mt-1 inline-flex items-center gap-2 rounded-lg bg-primary px-4 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <i data-lucide="plus" class="h-3.5 w-3.5"></i> New note
        </a>
      )}
    </div>
  );
};

export const NoteGrid = ({ notes, locale, query, pinnedOnly }: NoteListProps) => (
  <div id="note-grid" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {notes.length === 0 ? (
      <EmptyState query={query} pinnedOnly={pinnedOnly} />
    ) : (
      notes.map((note) => <NoteCard note={note} locale={locale} />)
    )}
  </div>
);

// ==========================================
// PAGE
// ==========================================

interface NotePageProps extends NoteListProps {
  canCreate: boolean;
  total: number;
  pinnedCount: number;
}

const Toolbar = ({
  query,
  pinnedOnly,
  pinnedCount,
}: {
  query: string;
  pinnedOnly: boolean;
  pinnedCount: number;
}) => (
  // The controls carry the HTMX attributes, not the form. A trigger on the
  // form needs `from:` selectors to know which child fired, which is fragile;
  // per-control triggers with `hx-include="closest form"` send the whole form
  // either way, so search and the pinned toggle never disagree.
  //
  // The form still works with JavaScript off: it is a plain GET to /notes, and
  // hx-boost turns the Enter-key submit into a normal page swap.
  <form action="/notes" method="get" class="flex flex-col gap-3 sm:flex-row sm:items-center">
    <div class="relative flex-1">
      <i
        data-lucide="search"
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      ></i>
      <input
        type="search"
        name="q"
        value={query}
        placeholder="Search notes…"
        autocomplete="off"
        aria-label="Search notes"
        hx-get="/notes"
        hx-trigger="input changed delay:300ms, search"
        hx-target="#note-grid"
        hx-swap="outerHTML"
        hx-include="closest form"
        hx-push-url="true"
        class="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>

    <label
      class={`inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors ${
        pinnedOnly
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-input hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      <input
        type="checkbox"
        name="pinned"
        value="1"
        checked={pinnedOnly}
        hx-get="/notes"
        hx-trigger="change"
        hx-target="#note-grid"
        hx-swap="outerHTML"
        hx-include="closest form"
        hx-push-url="true"
        class="sr-only"
        aria-label="Show pinned notes only"
      />
      <i data-lucide="pin" class="h-4 w-4"></i>
      Pinned
      <span class="text-tiny tabular-nums opacity-70">{pinnedCount}</span>
    </label>
  </form>
);

export const NoteListPage = ({
  notes,
  locale,
  query,
  pinnedOnly,
  canCreate,
  total,
  pinnedCount,
}: NotePageProps) => (
  <div class="mx-auto max-w-6xl space-y-6 p-6 pt-20 sm:p-8 sm:pt-24 animate-in fade-in duration-500">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Notes</h1>
        <p class="text-sm text-muted-foreground">
          {total === 0
            ? "An example feature. Copy its shape for your own, then delete it."
            : `${total} note${total === 1 ? "" : "s"}${pinnedCount > 0 ? ` · ${pinnedCount} pinned` : ""}`}
        </p>
      </div>

      {canCreate ? (
        <a
          href="/notes/new"
          class="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 h-10 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <i data-lucide="plus" class="h-4 w-4"></i> New note
        </a>
      ) : null}
    </div>

    <Toolbar query={query} pinnedOnly={pinnedOnly} pinnedCount={pinnedCount} />

    <NoteGrid notes={notes} locale={locale} query={query} pinnedOnly={pinnedOnly} />
  </div>
);

// ==========================================
// FORM
// ==========================================

interface NoteFormProps {
  note?: SelectNote;
  errors?: Record<string, string>;
}

export const NoteFormPage = ({ note, errors }: NoteFormProps) => {
  const isEdit = Boolean(note);
  const action = isEdit ? `/notes/${note!.id}` : "/notes";
  const current = (note?.accent as NoteAccent) ?? "neutral";

  return (
    <div class="mx-auto max-w-2xl space-y-6 p-6 pt-20 sm:p-8 sm:pt-24 animate-in fade-in duration-500">
      <div class="flex items-center gap-3">
        <a
          href="/notes"
          aria-label="Back to notes"
          class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-input hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <i data-lucide="arrow-left" class="h-4 w-4"></i>
        </a>
        <h1 class="text-2xl font-bold tracking-tight">{isEdit ? "Edit note" : "New note"}</h1>
      </div>

      <form
        hx-post={action}
        hx-target="body"
        hx-swap="outerHTML"
        class="space-y-6 rounded-2xl border bg-card text-card-foreground p-6 shadow-sm"
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
            placeholder="What is this about?"
            class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {errors?.title ? <p class="text-sm text-destructive">{errors.title}</p> : null}
        </div>

        <div class="space-y-2">
          <label for="body" class="text-sm font-medium">
            Details
          </label>
          <textarea
            id="body"
            name="body"
            rows={8}
            placeholder="Anything you want to remember…"
            class="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {note?.body ?? ""}
          </textarea>
          {errors?.body ? <p class="text-sm text-destructive">{errors.body}</p> : null}
        </div>

        <fieldset class="space-y-2">
          <legend class="text-sm font-medium">Accent</legend>
          <p class="text-sm text-muted-foreground">
            Follows the theme, so it stays readable in light and dark.
          </p>
          <div class="flex flex-wrap items-center gap-3 pt-1">
            {NOTE_ACCENTS.map((key) => (
              <label class="cursor-pointer" title={ACCENTS[key].label}>
                <input
                  type="radio"
                  name="accent"
                  value={key}
                  checked={current === key}
                  class="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  class={`block h-8 w-8 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-card transition-all peer-checked:ring-ring peer-focus-visible:ring-ring ${ACCENTS[key].swatch}`}
                ></span>
                <span class="sr-only">{ACCENTS[key].label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label class="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="pinned"
            checked={note?.pinned ?? false}
            class="h-4 w-4 rounded border-input accent-primary"
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
            class="inline-flex items-center justify-center rounded-lg border border-input px-5 h-10 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
};
