import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("totp-verify-modal")
export class TotpVerifyModal extends LitElement {
  @property({ type: Boolean, reflect: true })
  open = false;

  @state()
  private code = "";

  @state()
  private isVerifying = false;

  @state()
  private error = "";

  private inputRef?: HTMLInputElement;

  createRenderRoot() {
    return this;
  }

  openModal() {
    this.open = true;
    this.resetForm();
    // Focus input after modal opens
    setTimeout(() => this.inputRef?.focus(), 100);
  }

  closeModal() {
    this.open = false;
    this.resetForm();
  }

  private resetForm() {
    this.code = "";
    this.error = "";
    this.isVerifying = false;
  }

  private handleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    // Only allow numbers
    this.code = input.value.replace(/\D/g, "").slice(0, 6);
    this.error = ""; // Clear error on input
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && this.code.length === 6) {
      this.handleVerify();
    }
  }

  private async handleVerify() {
    if (this.code.length !== 6) return;

    this.isVerifying = true;
    this.error = "";

    // Dispatch event for parent to handle verification
    this.dispatchEvent(
      new CustomEvent("totp-verify", {
        bubbles: true,
        composed: true,
        detail: { code: this.code },
      }),
    );
  }

  // Public methods for parent to control verification result
  public verifySuccess() {
    this.isVerifying = false;
    this.closeModal();
  }

  public verifyError(message = "Invalid code. Please try again.") {
    this.error = message;
    this.code = "";
    this.isVerifying = false;
    this.inputRef?.focus();
  }

  render() {
    if (!this.open) return nothing;

    return html`
      <div
        class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        @click=${this.closeModal}
      >
        <div
          class="grid w-full max-w-md gap-4 border bg-background p-6 shadow-lg sm:rounded-lg animate-in zoom-in-95 slide-in-from-bottom-5"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <div class="flex flex-col space-y-1.5 text-center sm:text-left">
            <h2 class="text-lg font-semibold leading-none tracking-tight">Verify Your Identity</h2>
            <p class="text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          <div class="py-4 space-y-4">
            <div class="space-y-2">
              <input
                ${(el: HTMLInputElement) => (this.inputRef = el)}
                .value="${this.code}"
                @input=${this.handleInput}
                @keydown=${this.handleKeyDown}
                maxlength="6"
                inputmode="numeric"
                placeholder="000 000"
                ?disabled=${this.isVerifying}
                class="flex h-12 w-full rounded-lg border border-input bg-background px-3 py-2 text-center text-xl tracking-[0.5em] font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
              ${
                this.error
                  ? html`<p class="text-sm text-destructive text-center">${this.error}</p>`
                  : nothing
              }
            </div>
          </div>

          <div class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2">
            <button
              @click=${this.closeModal}
              ?disabled=${this.isVerifying}
              class="inline-flex items-center justify-center rounded-lg text-sm font-medium border border-input bg-background hover:bg-accent h-11 px-4 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              @click=${this.handleVerify}
              ?disabled=${this.isVerifying || this.code.length !== 6}
              class="inline-flex items-center justify-center rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-4 disabled:opacity-50"
            >
              ${this.isVerifying ? "Verifying..." : "Verify"}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "totp-verify-modal": TotpVerifyModal;
  }
}
