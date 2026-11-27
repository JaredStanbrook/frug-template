import { getFlashToast } from "../lib/utils";
import { LitElement, html, PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";
// We import specific icons to keep the bundle size small (tree-shaking)
import { createIcons, CircleCheck, CircleX, TriangleAlert, Info, Loader2, X } from "lucide";

// Types
export type ToastType = "success" | "error" | "info" | "warning";
export interface ToastEvent {
  message: string;
  description?: string;
  type?: ToastType;
  duration?: number;
}

interface ActiveToast extends ToastEvent {
  id: number;
  type: ToastType;
  /** Time left before it goes, kept up to date while paused. */
  remaining: number;
  startedAt: number;
  timerId?: number;
  leaving?: boolean;
}

/** More than this and the oldest goes: a stack should not cover the page. */
const MAX_TOASTS = 3;
const DEFAULT_DURATION = 4000;
/** An error usually asks the reader to do something, so it stays long enough to read twice. */
const MIN_ERROR_DURATION = 8000;
/** Matches the exit animation below. */
const EXIT_MS = 200;

// 1. Map types to Lucide data attributes and Tailwind classes
// We use <i> tags which Lucide will replace with SVGs
//
// Theme tokens rather than palette colours, so a toast reads correctly in both
// modes and follows any re-theming for free. `--success` and `--warning` exist
// in worker/index.css precisely so status UI never has to reach for the
// palette — see the note there.
const IconMap = {
  success: html`<i data-lucide="circle-check" class="h-5 w-5 text-success"></i>`,
  error: html`<i data-lucide="circle-x" class="h-5 w-5 text-destructive"></i>`,
  warning: html`<i data-lucide="triangle-alert" class="h-5 w-5 text-warning"></i>`,
  info: html`<i data-lucide="info" class="h-5 w-5 text-primary"></i>`,
  loader: html`<i data-lucide="loader-2" class="h-5 w-5 text-muted-foreground animate-spin"></i>`,
  close: html`<i data-lucide="x" class="h-4 w-4"></i>`,
};

/** The stripe down the leading edge. Whole class names: Tailwind cannot see built ones. */
const AccentMap: Record<ToastType, string> = {
  success: "bg-success",
  error: "bg-destructive",
  warning: "bg-warning",
  info: "bg-primary",
};

@customElement("app-toaster")
export class AppToaster extends LitElement {
  @state() private toasts: ActiveToast[] = [];
  private counter = 0;
  private paused = false;

  // Use Light DOM so global Tailwind classes work
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("toast", this.handleToastEvent as EventListener);
    // Back in the page after a move: let the clocks run again.
    this.resume();

    const flashToast = getFlashToast();
    if (flashToast) {
      setTimeout(() => this.addToast(flashToast), 100);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("toast", this.handleToastEvent as EventListener);
    this.pause();
  }

  // 2. LIFECYCLE HOOK: This runs every time the component re-renders
  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);

    // Scan ONLY this component for new <i> tags and replace them
    createIcons({
      root: this, // Limits scope to this component for performance
      icons: {
        CircleCheck,
        CircleX,
        TriangleAlert,
        Info,
        Loader2,
        X,
      },
      attrs: {
        "stroke-width": "2", // Consistent stroke width
      },
    });
  }

  handleToastEvent = (e: CustomEvent<ToastEvent>) => {
    this.addToast(e.detail);
  };

  addToast(toast: ToastEvent) {
    const type = toast.type || "info";
    let duration = toast.duration || DEFAULT_DURATION;
    if (type === "error") duration = Math.max(duration, MIN_ERROR_DURATION);

    // The same message again (a double click, a retried request) restarts the
    // one already showing rather than stacking a copy of it.
    const same = this.toasts.find(
      (t) =>
        !t.leaving &&
        t.type === type &&
        t.message === toast.message &&
        t.description === toast.description,
    );
    if (same) {
      clearTimeout(same.timerId);
      same.remaining = duration;
      if (!this.paused) this.schedule(same);
      return;
    }

    const next: ActiveToast = {
      ...toast,
      type,
      id: this.counter++,
      remaining: duration,
      startedAt: Date.now(),
    };
    if (!this.paused) this.schedule(next);

    // Newest first, nearest the top of the screen.
    const kept = [next, ...this.toasts];
    for (const dropped of kept.slice(MAX_TOASTS)) clearTimeout(dropped.timerId);
    this.toasts = kept.slice(0, MAX_TOASTS);
  }

  private schedule(toast: ActiveToast) {
    toast.startedAt = Date.now();
    toast.timerId = window.setTimeout(() => this.removeToast(toast.id), toast.remaining);
  }

  /**
   * Stop the clocks while the pointer or keyboard focus is on a toast, so
   * nobody loses a message halfway through reading it or reaching for its
   * close button. Every toast pauses, not just the one pointed at: the others
   * are being read too.
   */
  private pause = () => {
    if (this.paused) return;
    this.paused = true;
    for (const toast of this.toasts) {
      clearTimeout(toast.timerId);
      toast.remaining -= Date.now() - toast.startedAt;
    }
  };

  private resume = () => {
    if (!this.paused) return;
    this.paused = false;
    for (const toast of this.toasts) if (!toast.leaving) this.schedule(toast);
  };

  private onFocusOut = (e: FocusEvent) => {
    if (!this.contains(e.relatedTarget as Node | null)) this.resume();
  };

  removeToast(id: number) {
    const toast = this.toasts.find((t) => t.id === id);
    if (!toast || toast.leaving) return;
    clearTimeout(toast.timerId);

    // Play the exit, then drop it. A new array, so Lit re-renders the class.
    toast.leaving = true;
    this.toasts = [...this.toasts];
    window.setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      // Closing the toast that held focus would drop it on <body>.
      if (!this.querySelector(":focus-within")) this.resume();
    }, EXIT_MS);
  }

  render() {
    // Top right, under the nav. The bottom of the screen is where the cookie
    // banner lives, and a toast laid over its buttons blocks them.
    //
    // aria-live on a container that is always in the page, so screen readers
    // announce each toast as it arrives: a live region added together with
    // its content is not reliably read out.
    return html`
      <section
        class="pointer-events-none fixed inset-x-0 top-14 z-[100] flex flex-col gap-2 p-4 sm:left-auto sm:w-[380px]"
        aria-label="Notifications"
      >
        <div aria-live="polite" aria-relevant="additions text" class="flex flex-col gap-2">
          ${this.toasts.map(
            (toast) => html`
              <div
                class="pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border border-border bg-popover py-3 pl-4 pr-1 text-popover-foreground shadow-lg duration-200 motion-reduce:animate-none ${
                  toast.leaving
                    ? "animate-out fade-out slide-out-to-right fill-mode-forwards"
                    : "animate-in fade-in slide-in-from-top-2"
                }"
                data-type="${toast.type}"
                @mouseenter=${this.pause}
                @mouseleave=${this.resume}
                @focusin=${this.pause}
                @focusout=${this.onFocusOut}
              >
                <span
                  class="absolute inset-y-0 left-0 w-1 ${AccentMap[toast.type]}"
                  aria-hidden="true"
                ></span>
                <div class="mt-2.5 shrink-0" aria-hidden="true">${IconMap[toast.type]}</div>

                <div class="grid min-w-0 grow gap-0.5 py-2">
                  ${
                    toast.message
                      ? html`<p class="text-sm font-semibold leading-snug">${toast.message}</p>`
                      : null
                  }
                  ${
                    toast.description
                      ? html`<p class="text-sm leading-snug text-muted-foreground">
                          ${toast.description}
                        </p>`
                      : null
                  }
                </div>

                <!-- Always visible, and a flex child rather than an overlay.
                     It used to be revealed on group-hover only, which means it
                     did not exist on a touch device: there is no hover to reveal
                     it, so a toast could only ever time out. -->
                <button
                  @click=${() => this.removeToast(toast.id)}
                  class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Dismiss notification"
                >
                  ${IconMap.close}
                </button>
              </div>
            `,
          )}
        </div>
      </section>
    `;
  }
}
