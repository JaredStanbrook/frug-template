import "../index.css";

// HTMX first: it wires itself up on DOMContentLoaded, and this module is
// deferred, so importing it here still runs before that fires. Bundled rather
// than loaded from a CDN so the app has no third-party runtime dependency and
// works offline and behind a strict CSP.
import "htmx.org";

import { renderIcons } from "./lib/icons";

import "./ui/AppToaster";
import "./ui/ThemeProvider";
import "./ui/ThemeToggle";
import "./ui/NavUserMenu";

/**
 * Components only some pages use — sign-in, registration, the profile —
 * loaded when one of their elements is actually on the page.
 *
 * They pull in the QR-code library and the WebAuthn client, roughly a third
 * of the bundle, and every public visitor would otherwise download and parse
 * them on every page for nothing. Checked again after each HTMX swap, since a
 * fragment can bring one in; the element upgrades itself the moment its
 * module defines it.
 *
 * A new client component: import it above if most pages render it, or add
 * one entry per tag it defines here if only a few do.
 */
const ISLANDS: Record<string, () => Promise<unknown>> = {
  "auth-login": () => import("./auth/AuthLogin"),
  "auth-register": () => import("./auth/AuthRegister"),
  "totp-verify-modal": () => import("./auth/TotpVerifyModal"),
  "totp-setup-button": () => import("./auth/TotpSetupButton"),
  "profile-editable-name": () => import("./ui/ProfileIslands"),
  "profile-password-modal": () => import("./ui/ProfileIslands"),
  "profile-delete-modal": () => import("./ui/ProfileIslands"),
};

const loadIslands = (root: ParentNode = document) => {
  for (const [tag, load] of Object.entries(ISLANDS)) {
    if (!customElements.get(tag) && root.querySelector(tag)) {
      load().catch((err) => console.error(`[islands] could not load <${tag}>:`, err));
    }
  }
};

declare global {
  interface Window {
    /**
     * Exposed for the inline scripts the server renders — `NavBar.tsx` toggles
     * theme icons and needs to re-render them, and it cannot import from this
     * bundle. Deliberately the only global this file adds.
     */
    renderIcons?: typeof renderIcons;
  }
}

window.renderIcons = renderIcons;

// Render icons for markup HTMX just swapped in.
document.body.addEventListener("htmx:afterSwap", () => {
  renderIcons();
  loadIslands();
});

// And for the server-rendered page itself.
document.addEventListener("DOMContentLoaded", () => {
  renderIcons();
  loadIslands();
});

/**
 * Optional: Add loading state to body during HTMX requests
 */
document.body.addEventListener("htmx:beforeRequest", () => {
  document.body.classList.add("htmx-loading");
});

document.body.addEventListener("htmx:afterRequest", () => {
  document.body.classList.remove("htmx-loading");
});

document.body.addEventListener("htmx:beforeOnLoad", (evt: any) => {
  // Allow both success (2xx) and our specific Conflict (409) to swap
  if (evt.detail.xhr.status === 409) {
    evt.detail.shouldSwap = true;
    evt.detail.isError = false;
  }
});
/**
 * Optional: Handle HTMX errors gracefully
 */
document.body.addEventListener("htmx:responseError", (evt: any) => {
  const xhr = evt.detail.xhr;
  if (xhr.status === 409) return;
  const triggerHeader = xhr.getResponseHeader("HX-Trigger");
  let hasToastTrigger = false;

  if (triggerHeader) {
    try {
      const triggers = JSON.parse(triggerHeader);
      // Check if "toast" is one of the keys in the trigger object
      if (triggers.toast) {
        hasToastTrigger = true;
      }
    } catch (e) {
      console.error("Failed to parse HX-Trigger header", e);
    }
  }
  if (!hasToastTrigger) {
    window.dispatchEvent(
      new CustomEvent("toast", {
        detail: {
          message: "Something went wrong",
          description: "Please try again or contact support if the problem persists.",
          type: "error",
          duration: 5000,
        },
      }),
    );
  }
});

/**
 * Optional: Scroll to top after navigation
 */
document.body.addEventListener("htmx:afterSwap", (evt: any) => {
  // Only scroll if we're swapping the main content
  if (evt.detail.target?.id === "main-content") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

document.addEventListener("click", (event) => {
  // 1. Find all details elements that are currently open
  const openDetails = document.querySelectorAll("details[open]");
  const target = event.target as Node;

  openDetails.forEach((details) => {
    // 2. Check if the click happened INSIDE the current details element
    const isClickInside = details.contains(target);

    // 3. If the click was OUTSIDE, remove the open attribute to close it
    if (!isClickInside) {
      details.removeAttribute("open");
    }
  });
});

/**
 * Lazily load per-page Web Components here so the shared bundle stays small:
 *
 *   const initPageModules = () => {
 *     import("./ui/YourFilters");
 *   };
 *   document.addEventListener("DOMContentLoaded", initPageModules);
 */
