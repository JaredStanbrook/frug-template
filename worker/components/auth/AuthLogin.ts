import { LitElement, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { api, getErrorMessage, redirectWithToast } from "../lib/utils";
import "./TotpVerifyModal";
import type { TotpVerifyModal } from "./TotpVerifyModal";
import { startAuthentication } from "@simplewebauthn/browser";

@customElement("auth-login")
export class AuthLogin extends LitElement {
  @property({ type: String, attribute: "default-tab" }) defaultTab = "password";
  @property({ type: String, attribute: "csrf-token" }) csrfToken = "";

  @state()
  private activeTab = "";

  @state()
  private isSubmitting = false;

  @state()
  private totpSessionData: { email: string; password: string } | null = null;

  @query("totp-verify-modal")
  private totpModal!: TotpVerifyModal;

  // Use light DOM so Tailwind classes work
  protected createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.activeTab = this.defaultTab;
    this.setupTabSwitching();
    this.setupFormHandlers();
    this.setupTotpHandler();
    this.activateTab(this.activeTab);
  }

  private setupTabSwitching() {
    const tabButtons = this.querySelectorAll<HTMLButtonElement>(".tab-btn");
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        if (tab) this.switchTab(tab);
      });
    });
  }

  private switchTab(tab: string) {
    this.activeTab = tab;
    this.activateTab(tab);
  }

  private activateTab(tab: string) {
    // Update tab buttons
    const tabButtons = this.querySelectorAll<HTMLButtonElement>(".tab-btn");
    tabButtons.forEach((btn) => {
      if (btn.getAttribute("data-tab") === tab) {
        btn.setAttribute("data-state", "active");
      } else {
        btn.removeAttribute("data-state");
      }
    });

    // Show/hide content panels
    const contentPanels = this.querySelectorAll<HTMLDivElement>("[data-content]");
    contentPanels.forEach((panel) => {
      if (panel.getAttribute("data-content") === tab) {
        panel.classList.remove("hidden");
      } else {
        panel.classList.add("hidden");
      }
    });
  }

  private setupFormHandlers() {
    // Password form
    const passwordForm = this.querySelector<HTMLFormElement>("#login-form");
    if (passwordForm) {
      passwordForm.addEventListener("submit", (e) => this.handlePasswordSubmit(e));
    }

    // PIN form
    const pinForm = this.querySelector<HTMLFormElement>("#pin-login-form");
    if (pinForm) {
      pinForm.addEventListener("submit", (e) => this.handlePinSubmit(e));
    }

    // Passkey form
    const passkeyForm = this.querySelector<HTMLFormElement>("#passkey-login-form");
    if (passkeyForm) {
      passkeyForm.addEventListener("submit", (e) => this.handlePasskeySubmit(e));
    }
  }

  private setupTotpHandler() {
    // Listen for TOTP verification event from modal
    this.addEventListener("totp-verify", (e: Event) => {
      const customEvent = e as CustomEvent;
      this.handleTotpVerify(customEvent.detail.code);
    });
  }

  private showError(message: string) {
    const errorContainer = this.querySelector<HTMLDivElement>("#login-error");
    const errorMsg = this.querySelector<HTMLSpanElement>("#login-error-msg");
    if (errorContainer && errorMsg) {
      errorMsg.textContent = message;
      errorContainer.classList.remove("hidden");
      setTimeout(() => {
        errorContainer.classList.add("hidden");
      }, 5000);
    }
  }

  private async handlePasswordSubmit(e: Event) {
    e.preventDefault();
    if (this.isSubmitting) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) {
      this.showError("Email and password are required");
      return;
    }

    this.isSubmitting = true;
    this.disableSubmitButton(form);

    try {
      const response = await api.auth.login.$post({ json: { email, password } });

      if (response.status === 403) {
        const data = await response.json();
        if ("requireTotp" in data && data.requireTotp) {
          // Store credentials for TOTP verification
          this.totpSessionData = { email, password };
          this.totpModal.openModal();
          return;
        }
      }

      if (!response.ok) throw new Error(await getErrorMessage(response));

      redirectWithToast("/", "Login successful!", "Welcome to your dashboard.", "success");
    } catch (error: any) {
      this.showError(error.message);
    } finally {
      this.isSubmitting = false;
      this.enableSubmitButton(form);
    }
  }

  private async handleTotpVerify(code: string) {
    if (!this.totpSessionData) {
      this.totpModal.verifyError("Session expired. Please try logging in again.");
      return;
    }

    try {
      const response = await api.auth.login.$post({
        json: {
          email: this.totpSessionData.email,
          password: this.totpSessionData.password,
          totpCode: code,
        },
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        this.totpModal.verifyError(errorMsg);
        return;
      }

      // Success!
      this.totpModal.verifySuccess();
      this.totpSessionData = null;

      redirectWithToast("/", "Login successful!", "Welcome to your dashboard.", "success");
    } catch (error: any) {
      this.totpModal.verifyError("Verification failed. Please try again.");
      console.error("TOTP verification error:", error);
    }
  }

  private async handlePinSubmit(e: Event) {
    e.preventDefault();
    if (this.isSubmitting) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const email = formData.get("email") as string;
    const pin = formData.get("pin") as string;

    if (!email || !pin) {
      this.showError("Email and PIN are required");
      return;
    }

    if (!/^\d{4,6}$/.test(pin)) {
      this.showError("PIN must be 4-6 digits");
      return;
    }

    this.isSubmitting = true;
    this.disableSubmitButton(form);

    try {
      const response = await api.auth.login.$post({ json: { email, pin } });

      if (!response.ok) throw new Error(await getErrorMessage(response));

      redirectWithToast("/", "Login successful!", "Welcome to your dashboard.", "success");
    } catch (error: any) {
      this.showError(error.message);
    } finally {
      this.isSubmitting = false;
      this.enableSubmitButton(form);
    }
  }

  private async handlePasskeySubmit(e: Event) {
    e.preventDefault();
    if (this.isSubmitting) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const email = formData.get("email") as string;

    if (!email) {
      this.showError("Email is required");
      return;
    }

    this.isSubmitting = true;
    this.disableSubmitButton(form);

    try {
      const optRes = await api.auth.passkey.login.options.$post({ json: { email } });
      if (!optRes.ok) throw new Error(await getErrorMessage(optRes));

      const options = await optRes.json();

      // 2. Browser Interaction
      const authResp = await startAuthentication({ optionsJSON: options });

      // 3. Verify
      const verRes = await api.auth.passkey.login.verify.$post({
        json: { email, response: authResp, challengeId: options.challengeId },
      });

      if (!verRes.ok) throw new Error(await getErrorMessage(verRes));

      redirectWithToast("/", "Login successful!", "Welcome to your dashboard.", "success");
    } catch (error: any) {
      this.showError(error.message);
    } finally {
      this.isSubmitting = false;
      this.enableSubmitButton(form);
    }
  }

  private disableSubmitButton(form: HTMLFormElement) {
    const btn = form.querySelector<HTMLButtonElement>("button[type='submit']");
    if (btn) {
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.setAttribute("data-original-text", originalText || "");
      btn.textContent = "Please wait...";
    }
  }

  private enableSubmitButton(form: HTMLFormElement) {
    const btn = form.querySelector<HTMLButtonElement>("button[type='submit']");
    if (btn) {
      btn.disabled = false;
      const originalText = btn.getAttribute("data-original-text");
      if (originalText) btn.textContent = originalText;
    }
  }

  render() {
    return html`<slot></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "auth-login": AuthLogin;
  }
}
