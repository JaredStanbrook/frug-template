import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import QRCode from "qrcode";
import { api, toast } from "../lib/utils";

interface TotpSetupResponse {
  secret: string;
  otpauthUrl: string;
}

@customElement("totp-setup-button")
export class TotpSetupButton extends LitElement {
  @property({ type: Boolean })
  enabled = false;

  @state()
  private isLoading = false;

  // Modal State
  @state()
  private isModalOpen = false;

  @state()
  private step: "LOADING" | "SCAN" | "SUCCESS" = "LOADING";

  // Data State
  @state()
  private secretData: TotpSetupResponse | null = null;

  @state()
  private qrCodeUrl = "";

  @state()
  private code = "";

  @state()
  private isCopied = false;

  createRenderRoot() {
    return this;
  }

  // --- API ACTIONS ---

  private async handleEnable() {
    this.isModalOpen = true;
    this.step = "LOADING";
    this.code = "";

    try {
      const res = await api.auth.totp.setup.$get();
      if (!res.ok) throw new Error("Failed to setup TOTP");

      const data = await res.json();
      this.secretData = data;

      // Generate QR Code Image URL
      this.qrCodeUrl = await QRCode.toDataURL(data.otpauthUrl, {
        width: 150,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      this.step = "SCAN";
    } catch {
      toast("Error", "Could not generate TOTP secret", "error");
      this.isModalOpen = false;
    }
  }

  private async handleVerify() {
    if (this.code.length !== 6 || !this.secretData) return;
    this.isLoading = true;

    try {
      const res = await api.auth.totp.enable.$post({
        json: { secret: this.secretData.secret, code: this.code },
      });

      if (!res.ok) throw new Error("Invalid code");

      this.step = "SUCCESS";
      this.enabled = true;
      toast("Success", "2FA Enabled Successfully", "success");

      // Close after 2s and reload to update UI
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch {
      toast("Error", "Invalid verification code", "error");
    } finally {
      this.isLoading = false;
    }
  }

  private async handleDisable() {
    if (!confirm("Are you sure you want to disable 2FA? This makes your account less secure."))
      return;

    this.isLoading = true;

    try {
      const res = await api.auth.totp.disable.$delete();
      if (!res.ok) throw new Error();

      toast("Disabled", "Two-factor authentication removed", "info");

      // Reload to update UI
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch {
      toast("Error", "Could not disable 2FA", "error");
    } finally {
      this.isLoading = false;
    }
  }

  // --- UTILS ---

  private copyToClipboard() {
    if (this.secretData?.secret) {
      navigator.clipboard.writeText(this.secretData.secret);
      this.isCopied = true;
      toast("Copied", "Secret copied to clipboard", "success");
      setTimeout(() => (this.isCopied = false), 2000);
    }
  }

  private handleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.code = input.value.replace(/\D/g, "").slice(0, 6);
  }

  // --- RENDER ---
  render() {
    return html`
      ${
        this.enabled
          ? html`
              <button
                @click=${this.handleDisable}
                ?disabled=${this.isLoading}
                class="inline-flex items-center justify-center rounded-lg text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 px-4 disabled:opacity-50"
              >
                ${this.isLoading ? "Disabling..." : "Disable"}
              </button>
            `
          : html`
              <button
                @click=${this.handleEnable}
                ?disabled=${this.isLoading}
                class="inline-flex items-center justify-center rounded-lg text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 px-4 disabled:opacity-50"
              >
                ${this.isLoading ? "Enabling..." : "Enable"}
              </button>
            `
      }
      ${this.renderModal()}
    `;
  }

  private renderModal() {
    if (!this.isModalOpen) return nothing;

    return html`
      <div
        class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        @click=${() => (this.isModalOpen = false)}
      >
        <div
          class="grid w-full max-w-md gap-4 border bg-background p-6 shadow-lg sm:rounded-lg animate-in zoom-in-95 slide-in-from-bottom-5"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <div class="flex flex-col space-y-1.5 text-center sm:text-left">
            <h2 class="text-lg font-semibold leading-none tracking-tight">Setup Authenticator</h2>
            <p class="text-sm text-muted-foreground">
              Follow the steps below to secure your account.
            </p>
          </div>

          <div class="py-4">
            ${this.step === "LOADING" ? this.renderLoading() : nothing}
            ${this.step === "SCAN" ? this.renderScan() : nothing}
            ${this.step === "SUCCESS" ? this.renderSuccess() : nothing}
          </div>

          <div class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2">
            ${
              this.step === "SCAN"
                ? html`
                    <button
                      @click=${() => (this.isModalOpen = false)}
                      class="inline-flex items-center justify-center rounded-lg text-sm font-medium border border-input bg-background hover:bg-accent h-11 px-4"
                    >
                      Cancel
                    </button>
                    <button
                      @click=${this.handleVerify}
                      ?disabled=${this.isLoading || this.code.length !== 6}
                      class="inline-flex items-center justify-center rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-4 disabled:opacity-50"
                    >
                      ${this.isLoading ? "Verifying..." : "Verify & Activate"}
                    </button>
                  `
                : nothing
            }
            ${
              this.step === "SUCCESS"
                ? html`
                    <button
                      @click=${() => (this.isModalOpen = false)}
                      class="inline-flex items-center justify-center rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-4"
                    >
                      Done
                    </button>
                  `
                : nothing
            }
          </div>
        </div>
      </div>
    `;
  }

  private renderLoading() {
    return html`
      <div class="flex justify-center py-8">
        <svg
          class="h-8 w-8 animate-spin text-primary"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
    `;
  }

  private renderScan() {
    return html`
      <div class="space-y-4">
        <div class="flex flex-col items-center justify-center p-6 border rounded-lg bg-muted/50">
          <div class="bg-white p-2 rounded-lg shadow-sm">
            <img src="${this.qrCodeUrl}" alt="QR Code" class="w-[150px] h-[150px]" />
          </div>
          <p class="text-xs text-center text-muted-foreground mt-4">
            Scan this QR code with your authenticator app.
          </p>
        </div>

        <div class="space-y-2">
          <label class="text-xs uppercase text-muted-foreground font-semibold tracking-wider">
            Or enter code manually
          </label>
          <div class="flex gap-2">
            <div class="relative flex-1">
              <input
                readonly
                .value="${this.secretData?.secret || ""}"
                class="flex h-11 w-full rounded-lg border border-input bg-muted px-3 py-1 text-xs font-mono shadow-sm"
              />
            </div>
            <button
              @click=${this.copyToClipboard}
              class="inline-flex items-center justify-center rounded-lg border border-input bg-background h-11 w-11 hover:bg-accent text-muted-foreground"
            >
              ${
                this.isCopied
                  ? html`<svg
                      class="h-4 w-4 text-green-500"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>`
                  : html`<svg
                      class="h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>`
              }
            </button>
          </div>
        </div>

        <div class="space-y-2 pt-2">
          <label class="text-sm font-medium">Verify Code</label>
          <input
            .value="${this.code}"
            @input=${this.handleInput}
            maxlength="6"
            inputmode="numeric"
            placeholder="000 000"
            class="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.5em] font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>
    `;
  }

  private renderSuccess() {
    return html`
      <div class="py-6 flex flex-col items-center text-center space-y-3 animate-in zoom-in-95">
        <div
          class="h-12 w-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center"
        >
          <svg
            class="h-6 w-6 text-green-600 dark:text-green-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <h3 class="font-semibold text-lg">You're all set!</h3>
          <p class="text-sm text-muted-foreground">
            Two-factor authentication is now enabled on your account.
          </p>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "totp-setup-button": TotpSetupButton;
  }
}
