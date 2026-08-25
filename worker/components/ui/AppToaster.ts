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
  timerId?: number;
}

// 1. Map types to Lucide data attributes and Tailwind classes
// We use <i> tags which Lucide will replace with SVGs
const IconMap = {
  success: html`<i data-lucide="circle-check" class="h-5 w-5 text-emerald-500"></i>`,
  error: html`<i data-lucide="circle-x" class="h-5 w-5 text-red-500"></i>`,
  warning: html`<i data-lucide="triangle-alert" class="h-5 w-5 text-amber-500"></i>`,
  info: html`<i data-lucide="info" class="h-5 w-5 text-blue-500"></i>`,
  loader: html`<i data-lucide="loader-2" class="h-5 w-5 text-muted-foreground animate-spin"></i>`,
  close: html`<i data-lucide="x" class="h-4 w-4"></i>`,
};

@customElement("app-toaster")
export class AppToaster extends LitElement {
  @state() private toasts: ActiveToast[] = [];
  private counter = 0;

  // Use Light DOM so global Tailwind classes work
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("toast", this.handleToastEvent as EventListener);

    const flashToast = getFlashToast();
    if (flashToast) {
      setTimeout(() => this.addToast(flashToast), 100);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("toast", this.handleToastEvent as EventListener);
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
    const id = this.counter++;
    const duration = toast.duration || 4000;

    const timerId = window.setTimeout(() => {
      this.removeToast(id);
    }, duration);

    const newToast: ActiveToast = { ...toast, id, timerId, type: toast.type || "info" };

    // Trigger a re-render
    this.toasts = [...this.toasts, newToast];
  }

  removeToast(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  render() {
    return html`
      <div
        class="fixed bottom-0 right-0 z-[100] flex w-full max-w-[356px] flex-col gap-2.5 p-4 sm:bottom-4 sm:right-4 pointer-events-none"
        role="region"
        aria-label="Notifications"
      >
        ${this.toasts.map(
          (toast) => html`
            <div
              class="pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur transition-all duration-300 animate-in slide-in-from-bottom-5 fade-in hover:shadow-md group data-[type=error]:border-destructive/20"
              data-type="${toast.type}"
            >
              <div class="mt-0.5 shrink-0">${IconMap[toast.type || "info"]}</div>

              <div class="grid gap-1 grow">
                ${
                  toast.message
                    ? html`<div class="text-sm font-semibold leading-tight text-foreground">
                        ${toast.message}
                      </div>`
                    : null
                }
                ${
                  toast.description
                    ? html`<div class="text-sm text-muted-foreground leading-relaxed">
                        ${toast.description}
                      </div>`
                    : null
                }
              </div>

              <button
                @click=${() => this.removeToast(toast.id)}
                class="absolute right-2 top-2 rounded-lg p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground hover:bg-muted focus:opacity-100 focus:outline-none group-hover:opacity-100"
                aria-label="Close"
              >
                ${IconMap.close}
              </button>
            </div>
          `,
        )}
      </div>
    `;
  }
}
