// worker/components/analytics.ts
//
// The browser half of first-party analytics (worker/services/analytics.
// service.ts). Does nothing at all until the visitor allows performance
// cookies; starts the moment they do, and stops if they withdraw.
//
// For each page it sends: the path, where the visitor came from, how long the
// page took to load (the full load, or the HTMX swap on a boosted link), and
// later how long it stayed in view. For each form sent: the page and where
// the form went, never what was typed.

const ENDPOINT = "/api/analytics";

type Body = Record<string, unknown> & { type: "view" | "form" | "time" };

interface View {
  id: Promise<number | null>;
  /** Set once the server answers, so leaving the page can send at once. */
  known: number | null;
  visibleMs: number;
  visibleSince: number | null;
}

let current: View | null = null;
let started = false;
let swapStart: number | null = null;

const allowed = () => window.cookieConsent?.allows("performance") ?? false;

function beacon(body: Body) {
  const data = JSON.stringify(body);
  if (navigator.sendBeacon?.(ENDPOINT, data)) return;
  void fetch(ENDPOINT, { method: "POST", body: data, keepalive: true, credentials: "same-origin" });
}

async function recordView(loadMs: number | null): Promise<number | null> {
  try {
    const params = new URLSearchParams(location.search);
    const res = await fetch(ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({
        type: "view",
        path: location.pathname,
        // Only another site counts as a source.
        referrer: externalReferrer(),
        utmSource: params.get("utm_source"),
        loadMs,
      }),
    });
    return res.status === 200 ? ((await res.json()) as { id: number }).id : null;
  } catch {
    return null;
  }
}

function externalReferrer() {
  try {
    return document.referrer && new URL(document.referrer).host !== location.host
      ? document.referrer
      : "";
  } catch {
    return "";
  }
}

const visibleNow = () => (document.visibilityState === "visible" ? performance.now() : null);

/** Sends how long the current page has been in view so far. Safe to call often. */
function sendTime() {
  const view = current;
  if (!view) return;
  const total = Math.round(
    view.visibleMs + (view.visibleSince === null ? 0 : performance.now() - view.visibleSince),
  );
  if (total <= 0) return;
  const send = (id: number | null) => {
    if (id !== null) beacon({ type: "time", id, timeOnPageMs: total });
  };
  // Synchronously when the id is known: the page may be unloading.
  if (view.known !== null) send(view.known);
  else void view.id.then(send);
}

function startView(loadMs: number | null) {
  if (!allowed()) return;
  sendTime();
  const view: View = {
    id: recordView(loadMs),
    known: null,
    visibleMs: 0,
    visibleSince: visibleNow(),
  };
  void view.id.then((id) => (view.known = id));
  current = view;
}

/** The full page load, once the browser has finished it. */
function fullLoadMs(): number | null {
  const nav = performance.getEntriesByType("navigation")[0] as
    PerformanceNavigationTiming | undefined;
  return nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd - nav.startTime) : null;
}

function start() {
  if (started || !allowed()) return;
  started = true;
  if (document.readyState === "complete") startView(fullLoadMs());
  else
    window.addEventListener("load", () => setTimeout(() => startView(fullLoadMs())), {
      once: true,
    });

  // Boosted links swap the body without a page load: time the swap instead.
  document.addEventListener("htmx:beforeRequest", (e) => {
    if ((e as CustomEvent).detail?.boosted) swapStart = performance.now();
  });
  document.addEventListener("htmx:afterSettle", (e) => {
    const detail = (e as CustomEvent).detail;
    if (!detail?.boosted || swapStart === null) return;
    const took = Math.round(performance.now() - swapStart);
    swapStart = null;
    startView(took);
  });
  document.addEventListener("htmx:historyRestore", () => startView(null));

  // Time in view: paused while the tab is hidden, sent whenever it hides.
  document.addEventListener("visibilitychange", () => {
    const view = current;
    if (!view) return;
    if (document.visibilityState === "hidden") {
      if (view.visibleSince !== null) view.visibleMs += performance.now() - view.visibleSince;
      view.visibleSince = null;
      if (allowed()) sendTime();
    } else {
      view.visibleSince = performance.now();
    }
  });
  window.addEventListener("pagehide", () => allowed() && sendTime());

  // A form sent: where from and where to. Not the cookie choices themselves.
  document.addEventListener(
    "submit",
    (e) => {
      const form = e.target as HTMLFormElement;
      if (!allowed() || form.method === "dialog") return;
      const raw = form.getAttribute("hx-post") || form.getAttribute("action") || location.pathname;
      const target = new URL(raw, location.href);
      if (target.origin !== location.origin || target.pathname === "/cookies") return;
      beacon({ type: "form", path: location.pathname, target: target.pathname });
    },
    true,
  );
}

start();
// Allowed later, from the banner: start counting from this page.
window.addEventListener("cookie-consent", () => {
  if (!allowed()) current = null;
  else if (!started) start();
});

export {};
