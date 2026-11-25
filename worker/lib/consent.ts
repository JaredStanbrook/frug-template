// worker/lib/consent.ts
//
// The visitor's cookie choices, stored in the `cookie_consent` cookie as
// "1.fpt": a format version, then one digit each for functional, performance
// and targeting ("1" allowed, "0" not). No cookie means no choice yet, which
// allows nothing optional. The cookie is readable by page scripts on purpose:
// `window.cookieConsent` (CONSENT_SCRIPT, in every page's head) reads it so
// browser code can check before it stores or loads anything.

import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import {
  OPTIONAL_CATEGORIES,
  type CookieCategory,
  type OptionalCategory,
} from "../config/cookies.config";

export const CONSENT_COOKIE = "cookie_consent";

declare global {
  interface Window {
    /** Defined by CONSENT_SCRIPT in every page's head. */
    cookieConsent?: { given(): boolean; allows(category: CookieCategory): boolean };
  }
}
/** Six months: long enough not to nag, short enough that choices are asked again. */
const MAX_AGE = 60 * 60 * 24 * 182;

export type Consent = Record<OptionalCategory, boolean>;

export const NO_CONSENT: Consent = { functional: false, performance: false, targeting: false };

export function parseConsent(value: string | undefined): Consent | null {
  const m = value?.match(/^1\.([01])([01])([01])$/);
  if (!m) return null;
  return { functional: m[1] === "1", performance: m[2] === "1", targeting: m[3] === "1" };
}

export const serializeConsent = (consent: Consent) =>
  "1." + OPTIONAL_CATEGORIES.map((c) => (consent[c] ? "1" : "0")).join("");

/** The visitor's choices, or null when they have not made any yet. */
export const readConsent = (c: Context): Consent | null =>
  parseConsent(getCookie(c, CONSENT_COOKIE));

/** Whether a category of cookie may be set for this visitor. */
export function allows(c: Context, category: CookieCategory): boolean {
  if (category === "necessary") return true;
  return readConsent(c)?.[category] ?? false;
}

export function writeConsent(c: Context, consent: Consent) {
  setCookie(c, CONSENT_COOKIE, serializeConsent(consent), {
    path: "/",
    sameSite: "Lax",
    secure: c.req.url.startsWith("https://") || c.req.header("x-forwarded-proto") === "https",
    maxAge: MAX_AGE,
    // Not httpOnly: page scripts read it to know what they may store.
  });
}

/**
 * Defines `window.cookieConsent` before anything else runs, so any script can
 * ask `cookieConsent.allows("functional")` first. Choosing again fires a
 * `cookie-consent` event on window. Withdrawing "functional" clears what it
 * kept (the theme). Clicking anything with `data-cookie-preferences` opens
 * the preferences dialog.
 */
export const CONSENT_SCRIPT = `(function () {
  function read() {
    var m = document.cookie.match(/(?:^|; )${CONSENT_COOKIE}=1\\.([01])([01])([01])/);
    return m ? { functional: m[1] === "1", performance: m[2] === "1", targeting: m[3] === "1" } : null;
  }
  window.cookieConsent = {
    given: function () { return read() !== null; },
    allows: function (category) {
      if (category === "necessary") return true;
      var c = read();
      return !!(c && c[category]);
    },
  };
  document.addEventListener("htmx:afterRequest", function (e) {
    var xhr = e.detail && e.detail.xhr;
    if (!xhr || !xhr.responseURL || new URL(xhr.responseURL).pathname !== "/cookies") return;
    if (!window.cookieConsent.allows("functional")) {
      try { localStorage.removeItem("vite-ui-theme"); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent("cookie-consent", { detail: read() }));
  });
  document.addEventListener("click", function (e) {
    var opener = e.target.closest && e.target.closest("[data-cookie-preferences]");
    if (!opener) return;
    var dialog = document.getElementById("cookie-preferences");
    if (dialog && dialog.showModal) { e.preventDefault(); dialog.showModal(); }
  });
})();`;
