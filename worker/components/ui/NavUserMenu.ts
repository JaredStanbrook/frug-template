import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createIcons, User, LogOut, Loader2, CircleUser } from "lucide"; // Import the specific icons you need
import { api, redirectWithToast, toast } from "../lib/utils";

@customElement("nav-user-menu")
export class NavUserMenu extends LitElement {
  @property({ type: Object }) user: any = null;
  @state() private isOpen = false;
  @state() private isLoggingOut = false;

  createRenderRoot() {
    return this; // Render in Light DOM to inherit global Tailwind styles
  }

  toggle() {
    this.isOpen = !this.isOpen;
  }

  // Lit Lifecycle: Called after every update/render
  updated() {
    createIcons({
      root: this, // Only scan inside this component
      icons: {
        User,
        LogOut,
        Loader2,
        CircleUser,
      },
    });
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", (e) => {
      if (!this.contains(e.target as Node)) this.isOpen = false;
    });
  }

  async handleLogout(e: Event) {
    e.preventDefault();
    if (this.isLoggingOut) return;

    this.isLoggingOut = true;

    try {
      const response = await api.auth.logout.$post();

      if (response.ok) {
        localStorage.removeItem("selectedProperty");
        redirectWithToast("/login", "Logged out successfully", "", "success");
      } else {
        throw new Error("Logout failed");
      }
    } catch (error) {
      console.error("Logout error:", error);
      toast("Error logging out", "Please try again", "error");
      this.isLoggingOut = false;
    }
  }

  render() {
    if (!this.user) return nothing;

    return html`
      <div class="relative">
        <button
          @click=${this.toggle}
          class="flex h-8 items-center gap-2 rounded-full border border-border bg-background/50 pl-2 pr-4 hover:bg-accent transition-colors"
        >
          <div class="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
            <i data-lucide="circle-user" class="h-4 w-4 text-primary"></i>
          </div>
          <span class="text-sm font-medium">${this.user.firstName}</span>
        </button>

        ${
          this.isOpen
            ? html`
                <div
                  class="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in zoom-in-95 z-50"
                >
                  <div class="px-2 py-1.5 text-sm font-semibold">
                    <div class="flex flex-col space-y-1">
                      <p class="leading-none">${this.user.displayName || this.user.firstName}</p>
                      <p class="text-xs leading-none text-muted-foreground font-normal">
                        ${this.user.email}
                      </p>
                    </div>
                  </div>
                  <div class="h-px bg-muted my-1"></div>

                  <button
                    @click=${() => (window.location.href = "/profile")}
                    class="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <i data-lucide="user" class="mr-2 h-4 w-4"></i>
                    Profile
                  </button>

                  <div class="h-px bg-muted my-1"></div>

                  <button
                    @click=${this.handleLogout}
                    ?disabled=${this.isLoggingOut}
                    class="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-destructive/10 hover:text-destructive text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ${
                      this.isLoggingOut
                        ? html`<i data-lucide="loader-2" class="mr-2 h-4 w-4 animate-spin"></i>`
                        : html`<i data-lucide="log-out" class="mr-2 h-4 w-4"></i>`
                    }
                    ${this.isLoggingOut ? "Logging out..." : "Log out"}
                  </button>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }
}
