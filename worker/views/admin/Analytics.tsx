// worker/views/admin/Analytics.tsx
//
// /admin/analytics: what visitors who allowed performance cookies did. The
// figures come from worker/services/analytics.service.ts `report`.

import type { FC } from "hono/jsx";

import type { AppConfig } from "@server/config/app.config";
import type { SelectAnalyticsEvent } from "@server/schema/analytics.schema";
import type { Report } from "@server/services/analytics.service";

export const RANGES = [7, 30, 90] as const;

const seconds = (ms: number | null) =>
  ms == null ? "–" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

const duration = (ms: number | null) => {
  if (ms == null) return "–";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

const when = (iso: string, app: AppConfig) =>
  new Date(iso).toLocaleString(app.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: app.timezone,
  });

const Panel: FC<{ title: string; class?: string; children?: unknown }> = ({
  title,
  children,
  class: cls = "",
}) => (
  <section class={`rounded-2xl border bg-card p-5 shadow-sm ${cls}`}>
    <h2 class="mb-3 text-base font-semibold">{title}</h2>
    {children}
  </section>
);

const Empty = () => <p class="text-sm text-muted-foreground">Nothing yet.</p>;

/** A ranked list with a bar for each row's share of the top one. */
const Bars: FC<{ rows: { label: string; value: number }[] }> = ({ rows }) => {
  if (!rows.length) return <Empty />;
  const top = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul class="space-y-2 text-sm">
      {rows.map((r) => (
        <li>
          <div class="flex justify-between gap-3">
            <span class="truncate">{r.label}</span>
            <span class="tabular-nums text-muted-foreground">{r.value}</span>
          </div>
          <div class="mt-1 h-1.5 rounded-full bg-muted">
            <div
              class="h-1.5 rounded-full bg-primary"
              style={`width: ${Math.max(2, (r.value / top) * 100)}%`}
            ></div>
          </div>
        </li>
      ))}
    </ul>
  );
};

const Stat: FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div class="rounded-2xl border bg-card p-4 shadow-sm">
    <p class="text-sm text-muted-foreground">{label}</p>
    <p class="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
  </div>
);

export const AnalyticsPage: FC<{ report: Report; app: AppConfig; consentOn: boolean }> = ({
  report: r,
  app,
  consentOn,
}) => (
  <div class="mx-auto max-w-6xl space-y-6 p-4 py-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Analytics</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Only visitors who allowed performance cookies are counted.
        </p>
      </div>
      <nav class="flex gap-1" aria-label="Period">
        {RANGES.map((d) => (
          <a
            href={`/admin/analytics?days=${d}`}
            aria-current={d === r.days ? "page" : undefined}
            class={`inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium ${
              d === r.days
                ? "bg-primary text-primary-foreground"
                : "border border-input hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {d} days
          </a>
        ))}
      </nav>
    </div>

    {consentOn ? null : (
      <p class="rounded-lg bg-warning px-4 py-3 text-sm text-warning-foreground">
        Performance cookies are not offered (COOKIE_CATEGORIES), so nothing new is being recorded.
      </p>
    )}

    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Page views" value={r.totals.views} />
      <Stat label="Visitors" value={r.totals.visitors} />
      <Stat label="Visits" value={r.totals.sessions} />
      <Stat label="Signed in" value={r.totals.signedIn} />
      <Stat label="Average time on a page" value={duration(r.totals.avgTimeMs)} />
      <Stat label="Average load" value={seconds(r.totals.avgLoadMs)} />
      <Stat label="Forms sent" value={r.totals.forms} />
      <Stat
        label="Pages per visit"
        value={r.totals.sessions ? (r.totals.views / r.totals.sessions).toFixed(1) : "–"}
      />
    </div>

    <Panel title="Pages">
      {r.pages.length ? (
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b text-left text-muted-foreground">
                <th class="py-2 pr-4 font-medium">Page</th>
                <th class="py-2 pr-4 text-right font-medium">Views</th>
                <th class="py-2 pr-4 text-right font-medium">Time on page</th>
                <th class="py-2 text-right font-medium">Load</th>
              </tr>
            </thead>
            <tbody>
              {r.pages.map((p) => (
                <tr class="border-b last:border-0">
                  <td class="max-w-xs truncate py-2 pr-4">
                    <code>{p.path}</code>
                  </td>
                  <td class="py-2 pr-4 text-right tabular-nums">{p.views}</td>
                  <td class="py-2 pr-4 text-right tabular-nums">{duration(p.avgTimeMs)}</td>
                  <td class="py-2 text-right tabular-nums">{seconds(p.avgLoadMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty />
      )}
    </Panel>

    <div class="grid gap-6 md:grid-cols-2">
      <Panel title="Where visitors came from">
        <Bars rows={r.sources.map((s) => ({ label: s.source, value: s.views }))} />
      </Panel>
      <Panel title="Slowest pages (3 views or more)">
        <Bars
          rows={r.slow.map((s) => ({
            label: `${s.path} · ${seconds(s.avgLoadMs)}`,
            value: s.views,
          }))}
        />
      </Panel>
    </div>

    <div class="grid gap-6 md:grid-cols-3">
      <Panel title="Devices">
        <Bars rows={r.devices.map((d) => ({ label: d.label, value: d.views }))} />
      </Panel>
      <Panel title="Browsers">
        <Bars rows={r.browsers.map((d) => ({ label: d.label, value: d.views }))} />
      </Panel>
      <Panel title="Countries">
        <Bars rows={r.countries.map((d) => ({ label: d.label, value: d.views }))} />
      </Panel>
    </div>

    <Panel title="The way to each form">
      {r.journeys.length ? (
        <ol class="space-y-3 text-sm">
          {r.journeys.map((j) => (
            <li class="border-b pb-3 last:border-0">
              <p class="text-muted-foreground">
                {when(j.at, app)}
                {j.user ? ` · ${j.user}` : ""}
              </p>
              <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                {j.steps.map((s) => (
                  <>
                    <code>{s}</code>
                    <span aria-hidden="true" class="text-muted-foreground">
                      ›
                    </span>
                  </>
                ))}
                <span class="font-medium">form to {j.target ?? j.form}</span>
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <Empty />
      )}
    </Panel>

    <Panel title="Signed-in visitors">
      {r.people.length ? (
        <ul class="divide-y text-sm">
          {r.people.map((p) => (
            <li class="flex flex-wrap items-center justify-between gap-2 py-2">
              <a href={`/admin/analytics/users/${p.userId}`} class="font-medium hover:underline">
                {p.name}
              </a>
              <span class="text-muted-foreground">
                {p.views} views · last {when(p.lastAt, app)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty />
      )}
    </Panel>
  </div>
);

/** One signed-in visitor's pages and forms, newest first, grouped by visit. */
export const UserJourneyPage: FC<{
  name: string;
  events: SelectAnalyticsEvent[];
  app: AppConfig;
}> = ({ name, events, app }) => {
  const visits: SelectAnalyticsEvent[][] = [];
  for (const e of events) {
    const last = visits[visits.length - 1];
    if (last && last[0].sessionId === e.sessionId) last.push(e);
    else visits.push([e]);
  }
  return (
    <div class="mx-auto max-w-4xl space-y-6 p-4 py-8">
      <div>
        <a href="/admin/analytics" class="text-sm text-muted-foreground hover:underline">
          Analytics
        </a>
        <h1 class="mt-1 text-3xl font-bold tracking-tight">{name}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Their last {events.length} page views and forms, newest first, one block per visit.
        </p>
      </div>
      {visits.length === 0 ? <Empty /> : null}
      {visits.map((visit) => (
        <section class="rounded-2xl border bg-card p-5 shadow-sm">
          <p class="text-sm text-muted-foreground">
            {when(visit[visit.length - 1].createdAt, app)} · {visit[0].device ?? "?"},{" "}
            {visit[0].browser ?? "?"} on {visit[0].os ?? "?"}
            {visit[0].country ? ` · ${visit[0].country}` : ""}
          </p>
          <ol class="mt-2 space-y-1 text-sm">
            {[...visit].reverse().map((e) => (
              <li class="flex justify-between gap-4">
                <span>
                  {e.kind === "form" ? (
                    <>
                      Sent a form on <code>{e.path}</code> to <code>{e.target ?? "?"}</code>
                    </>
                  ) : (
                    <code>{e.path}</code>
                  )}
                </span>
                <span class="shrink-0 tabular-nums text-muted-foreground">
                  {e.kind === "view" ? duration(e.timeOnPageMs) : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
};
