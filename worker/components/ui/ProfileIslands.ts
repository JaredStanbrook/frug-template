import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api, toast } from "../lib/utils";

// --- 1. Editable Display Name ---
@customElement("profile-editable-name")
export class ProfileEditableName extends LitElement {
  @property() value = "";
  @state() private isEditing = false;
  @state() private isLoading = false;
  @state() private draftValue = "";

  createRenderRoot() {
    return this;
  }

  startEdit() {
    this.draftValue = this.value;
    this.isEditing = true;
  }

  async save() {
    if (!this.draftValue.trim()) return;
    this.isLoading = true;

    try {
      const res = await api.auth.me.$patch({ json: { displayName: this.draftValue } });

      if (!res.ok) throw new Error();

      this.value = this.draftValue;
      this.isEditing = false;
      toast("Profile updated", "Display name changed successfully", "success");
    } catch {
      toast("Error", "Could not update profile", "error");
    } finally {
      this.isLoading = false;
    }
  }

  render() {
    if (this.isEditing) {
      return html`
        <div class="flex items-center gap-2 max-w-sm animate-in fade-in zoom-in-95">
          <input
            type="text"
            .value=${this.draftValue}
            @input=${(e: Event) => (this.draftValue = (e.target as HTMLInputElement).value)}
            class="flex h-11 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            @click=${this.save}
            ?disabled=${this.isLoading}
            class="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
          >
            ${this.isLoading ? "..." : "Save"}
          </button>
          <button
            @click=${() => (this.isEditing = false)}
            class="inline-flex h-11 items-center justify-center rounded-lg border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
          >
            Cancel
          </button>
        </div>
      `;
    }

    return html`
      <div class="flex items-center gap-2 group">
        <span class="font-medium">${this.value || "Not set"}</span>
        <button
          @click=${this.startEdit}
          class="inline-flex h-11 shrink-0 items-center rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Edit
        </button>
      </div>
    `;
  }
}

// --- 2. Change Password Modal ---
@customElement("profile-password-modal")
export class ProfilePasswordModal extends LitElement {
  @state() private isOpen = false;
  @state() private isLoading = false;

  createRenderRoot() {
    return this;
  }

  async handleSubmit(e: Event) {
    e.preventDefault();
    this.isLoading = true;
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    try {
      const res = await api.auth["change-password"].$post({
        json: Object.fromEntries(formData) as { currentPassword: string; newPassword: string },
      });

      if (!res.ok) throw new Error();

      this.isOpen = false;
      toast("Success", "Password updated successfully", "success");
      form.reset();
    } catch {
      toast("Error", "Failed to update password", "error");
    } finally {
      this.isLoading = false;
    }
  }

  render() {
    return html`
      <button
        @click=${() => (this.isOpen = true)}
        class="inline-flex items-center justify-center rounded-lg text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 px-4"
      >
        Change Password
      </button>

      ${
        this.isOpen
          ? html`
              <div
                class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
              >
                <div
                  class="grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg sm:rounded-lg animate-in zoom-in-95 slide-in-from-bottom-5 relative"
                >
                  <div class="flex flex-col space-y-1.5 text-center sm:text-left">
                    <h2 class="text-lg font-semibold leading-none tracking-tight">
                      Change Password
                    </h2>
                    <p class="text-sm text-muted-foreground">
                      Enter your current password to set a new one.
                    </p>
                  </div>

                  <form @submit=${this.handleSubmit} class="grid gap-4 py-4">
                    <div class="grid gap-2">
                      <label class="text-sm font-medium">Current Password</label>
                      <input
                        name="currentPassword"
                        type="password"
                        required
                        class="flex h-11 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                    <div class="grid gap-2">
                      <label class="text-sm font-medium">New Password</label>
                      <input
                        name="newPassword"
                        type="password"
                        required
                        minlength="8"
                        class="flex h-11 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>

                    <div
                      class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2"
                    >
                      <button
                        type="button"
                        @click=${() => (this.isOpen = false)}
                        class="inline-flex items-center justify-center rounded-lg text-sm font-medium border border-input bg-background hover:bg-accent h-11 px-4"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        ?disabled=${this.isLoading}
                        class="inline-flex items-center justify-center rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-4 disabled:opacity-50"
                      >
                        ${this.isLoading ? "Updating..." : "Update Password"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            `
          : nothing
      }
    `;
  }
}

// --- 3. Delete Account Modal ---
@customElement("profile-delete-modal")
export class ProfileDeleteModal extends LitElement {
  @state() private isOpen = false;
  @state() private confirmText = "";
  @state() private isLoading = false;

  createRenderRoot() {
    return this;
  }

  async handleDelete() {
    if (this.confirmText !== "DELETE") return;
    this.isLoading = true;

    try {
      await api.auth.me.$delete();
      window.location.href = "/register";
    } catch {
      toast("Error", "Could not delete account", "error");
      this.isLoading = false;
    }
  }

  render() {
    return html`
      <button
        @click=${() => (this.isOpen = true)}
        class="inline-flex items-center justify-center rounded-lg text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 h-11 px-4"
      >
        Delete Account
      </button>

      ${
        this.isOpen
          ? html`
              <div
                class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
              >
                <div
                  class="grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg sm:rounded-lg animate-in zoom-in-95 relative"
                >
                  <div class="flex flex-col space-y-1.5">
                    <h2 class="text-lg font-semibold text-destructive">Are you absolutely sure?</h2>
                    <p class="text-sm text-muted-foreground">
                      This action cannot be undone. This will permanently delete your account.
                    </p>
                  </div>

                  <div class="grid gap-2 py-4">
                    <label class="text-sm font-medium"
                      >Type <span class="font-mono font-bold">DELETE</span> to confirm</label
                    >
                    <input
                      @input=${(e: Event) =>
                        (this.confirmText = (e.target as HTMLInputElement).value)}
                      class="flex h-11 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="DELETE"
                    />
                  </div>

                  <div class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2">
                    <button
                      @click=${() => (this.isOpen = false)}
                      class="inline-flex items-center justify-center rounded-lg text-sm font-medium border border-input bg-background hover:bg-accent h-11 px-4"
                    >
                      Cancel
                    </button>
                    <button
                      @click=${this.handleDelete}
                      ?disabled=${this.confirmText !== "DELETE" || this.isLoading}
                      class="inline-flex items-center justify-center rounded-lg text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 h-11 px-4 disabled:opacity-50"
                    >
                      ${this.isLoading ? "Deleting..." : "Confirm Deletion"}
                    </button>
                  </div>
                </div>
              </div>
            `
          : nothing
      }
    `;
  }
}
