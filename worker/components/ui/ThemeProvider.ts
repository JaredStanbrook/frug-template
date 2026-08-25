import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

// 1. Update the Theme type to include your custom options
export type Theme = "dark" | "light" | "system";

@customElement("theme-provider")
export class ThemeProvider extends LitElement {
  @property({ type: String }) storageKey = "vite-ui-theme";
  @property({ type: String }) defaultTheme: Theme = "system";

  @state() private theme: Theme = "system";

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    const stored = (localStorage.getItem(this.storageKey) as Theme) || this.defaultTheme;
    this.setTheme(stored);

    window.addEventListener("theme-change", this.handleThemeEvent as EventListener);

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", this.handleSystemChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("theme-change", this.handleThemeEvent as EventListener);

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .removeEventListener("change", this.handleSystemChange);
  }

  private handleThemeEvent = (e: CustomEvent<{ theme: Theme }>) => {
    this.setTheme(e.detail.theme);
  };

  private handleSystemChange = () => {
    if (this.theme === "system") {
      this.applyThemeToDocument("system");
    }
  };

  public setTheme(theme: Theme) {
    this.theme = theme;
    localStorage.setItem(this.storageKey, theme);
    this.applyThemeToDocument(theme);
  }

  private applyThemeToDocument(theme: Theme) {
    const root = document.documentElement;

    // 2. Clean up ALL potential theme classes before adding the new one
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);
      return;
    }
    root.classList.add(theme);
  }

  render() {
    return html`<div style="display: none;" aria-hidden="true"></div>`;
  }
}

// Helper to trigger theme changes from other components
export function setTheme(theme: Theme) {
  window.dispatchEvent(
    new CustomEvent("theme-change", {
      detail: { theme },
      bubbles: true,
      composed: true,
    }),
  );
}
