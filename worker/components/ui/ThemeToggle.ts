import { LitElement, html, PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";
import { setTheme } from "./ThemeProvider";
import { createIcons, Sun, Moon, Laptop } from "lucide";

const themes = ["light", "dark", "system"] as const;
type Theme = (typeof themes)[number];

@customElement("theme-toggle")
export class ThemeToggle extends LitElement {
  @state() private theme: Theme = "system";

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    const savedTheme = localStorage.getItem("vite-ui-theme") as Theme;
    if (savedTheme && themes.includes(savedTheme)) {
      this.theme = savedTheme;
    }
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    createIcons({
      root: this,
      icons: { Sun, Moon, Laptop },
      attrs: {
        class: "h-5 w-5",
      },
    });
  }

  toggle() {
    const currentIndex = themes.indexOf(this.theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    this.theme = nextTheme;
    setTheme(nextTheme);
  }

  render() {
    return html`
      <button
        @click=${this.toggle}
        type="button"
        class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
        aria-label="Toggle theme"
      >
        <span class="${this.theme === "light" ? "block" : "hidden"}">
          <i data-lucide="sun"></i>
        </span>

        <span class="${this.theme === "dark" ? "block" : "hidden"}">
          <i data-lucide="moon"></i>
        </span>

        <span class="${this.theme === "system" ? "block" : "hidden"}">
          <i data-lucide="laptop"></i>
        </span>

        <span class="sr-only">Toggle theme</span>
      </button>
    `;
  }
}
