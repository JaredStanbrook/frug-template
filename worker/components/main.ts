import "../index.css";
import "./ui/AppToaster";
import "./ui/ThemeProvider";
import "./ui/ThemeToggle";
import "./ui/NavUserMenu";
import "./ui/ProfileIslands";

import "./auth/AuthRegister";
import "./auth/AuthLogin";
import "./auth/TotpSetupButton";
import "./auth/TotpVerifyModal";

declare global {
  interface Window {
    lucide?: any;
  }
}

/**
 * Initialize Lucide icons after HTMX content swaps
 */
document.body.addEventListener("htmx:afterSwap", () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

/**
 * Initialize Lucide icons on page load
 */
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }
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
