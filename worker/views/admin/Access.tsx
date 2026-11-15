import type { FC } from "hono/jsx";

import type { AppConfig } from "@server/config/app.config";
import {
  ACCESS_DURATIONS,
  type AccessLinkState,
  type SelectAccessLink,
} from "@server/schema/access.schema";
import { linkState, type GateMode } from "@server/services/access-gate.service";
import { formatDateShort } from "@views/lib/utils";

const BADGE = "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium";

const STATE: Record<AccessLinkState, { class: string; label: string }> = {
  unused: { class: "bg-warning text-warning-foreground", label: "Not opened yet" },
  active: { class: "bg-success text-success-foreground", label: "Active" },
  expired: { class: "bg-muted text-muted-foreground", label: "Expired" },
  revoked: { class: "bg-muted text-muted-foreground", label: "Revoked" },
};

const MODE_NOTE: Record<GateMode, { class: string; label: string }> = {
  off: {
    class: "bg-warning text-warning-foreground",
    label: 'Gate off: the site is open to everyone. Set ACCESS_GATE to "session" or "link".',
  },
  session: {
    class: "bg-success text-success-foreground",
    label: "Gate on, single-use links: each link opens the site in one browser only.",
  },
  link: {
    class: "bg-success text-success-foreground",
    label: "Gate on, reusable links: anyone holding a link gets in until it expires.",
  },
};

const FIELD_CLASS =
  "flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const BUTTON_CLASS =
  "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors";

const durationLabel = (hours: number) =>
  ACCESS_DURATIONS.find((d) => d.hours === hours)?.label ??
  (hours % 24 === 0 ? `${hours / 24} days` : `${hours} hours`);

const dateTime = (iso: string, app: AppConfig) =>
  new Date(iso).toLocaleString(app.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: app.timezone,
  });

export const AccessLinkRow: FC<{ link: SelectAccessLink; app: AppConfig }> = ({ link, app }) => {
  const state = linkState(link);
  const url = `${app.origin}/a/${link.token}`;

  return (
    <div id={`access-${link.id}`} class="border-b px-5 py-4 last:border-0">
      <div class="flex flex-wrap items-center gap-3">
        <span class="min-w-0 flex-1 truncate font-medium">{link.label}</span>
        <span class={`${BADGE} ${STATE[state].class}`}>{STATE[state].label}</span>
      </div>

      <p class="mt-1 text-sm text-muted-foreground">
        {durationLabel(link.durationHours)} from first visit · created{" "}
        {formatDateShort(link.createdAt, app.locale)}
        {link.firstVisitedAt ? ` · opened ${dateTime(link.firstVisitedAt, app)}` : ""}
        {link.expiresAt && state !== "revoked"
          ? ` · ${state === "active" ? "expires" : "expired"} ${dateTime(link.expiresAt, app)}`
          : ""}
      </p>

      {state === "unused" || state === "active" ? (
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <label for={`access-url-${link.id}`} class="sr-only">
            Link for {link.label}
          </label>
          <input
            id={`access-url-${link.id}`}
            type="text"
            readonly
            value={url}
            onfocus="this.select()"
            class={`${FIELD_CLASS} min-w-0 basis-full font-mono text-xs sm:basis-0 sm:flex-1`}
          />
          {/* Inline rather than a Lit element: one write, then a two-second label. */}
          <button
            type="button"
            data-url={url}
            aria-label={`Copy link for ${link.label}`}
            onclick="navigator.clipboard.writeText(this.dataset.url).then(() => { const l = this.querySelector('[data-label]'); l.textContent = 'Copied'; setTimeout(() => { l.textContent = 'Copy'; }, 2000); })"
            class={`${BUTTON_CLASS} border border-input hover:bg-accent hover:text-accent-foreground`}
          >
            <i data-lucide="copy" class="h-4 w-4" aria-hidden="true"></i>
            <span data-label aria-live="polite">
              Copy
            </span>
          </button>
          <button
            type="button"
            hx-post={`/admin/access/${link.id}/revoke`}
            hx-target={`#access-${link.id}`}
            hx-swap="outerHTML"
            hx-confirm="Revoke this link? Whoever holds it loses access straight away."
            class={`${BUTTON_CLASS} text-destructive hover:bg-destructive/10`}
          >
            <i data-lucide="trash-2" class="h-4 w-4" aria-hidden="true"></i>
            Revoke
          </button>
        </div>
      ) : null}
    </div>
  );
};

interface AccessProps {
  links: SelectAccessLink[];
  app: AppConfig;
  mode: GateMode;
}

export const AccessPage: FC<AccessProps> = ({ links, app, mode }) => (
  <div class="mx-auto max-w-5xl space-y-8 p-4 py-8">
    <div class="space-y-2">
      <h1 class="text-3xl font-bold tracking-tight">Access links</h1>
      <p class="max-w-2xl text-muted-foreground text-pretty">
        Send one to each person you want to see the site. Its clock starts the first time it is
        opened, not when you create it. After that, the visitor is sent to a "nothing to see here"
        page.
      </p>
      <p>
        <span class={`${BADGE} ${MODE_NOTE[mode].class}`}>{MODE_NOTE[mode].label}</span>
      </p>
    </div>

    <form
      method="post"
      action="/admin/access"
      class="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-[1fr_12rem_auto]"
    >
      <div>
        <label for="label" class="block text-sm font-medium">
          Who is it for?
        </label>
        <input
          id="label"
          name="label"
          type="text"
          required
          maxlength={120}
          placeholder="Alex at Example Co"
          class={`${FIELD_CLASS} mt-1.5`}
        />
      </div>
      <div>
        <label for="durationHours" class="block text-sm font-medium">
          Lasts
        </label>
        <select id="durationHours" name="durationHours" class={`${FIELD_CLASS} mt-1.5`}>
          {ACCESS_DURATIONS.map((d) => (
            <option value={String(d.hours)} selected={d.hours === 168}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div class="flex items-end">
        <button
          type="submit"
          class={`${BUTTON_CLASS} w-full justify-center bg-primary px-4 text-primary-foreground hover:bg-primary/90`}
        >
          <i data-lucide="link" class="h-4 w-4" aria-hidden="true"></i>
          Create link
        </button>
      </div>
    </form>

    <div class="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {links.length === 0 ? (
        <div class="px-5 py-16 text-center">
          <p class="font-medium">No links yet</p>
          <p class="mt-1 text-sm text-muted-foreground">Create one above to invite someone.</p>
        </div>
      ) : (
        links.map((link) => <AccessLinkRow link={link} app={app} />)
      )}
    </div>
  </div>
);
