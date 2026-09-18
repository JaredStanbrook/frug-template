import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { api, getErrorMessage, redirectWithToast } from "../lib/utils";
import { startRegistration } from "@simplewebauthn/browser";

@customElement("auth-register")
export class AuthRegister extends LitElement {
  @property({ type: String, attribute: "default-tab" }) defaultTab = "password";
  @property({ type: String, attribute: "csrf-token" }) csrfToken = "";
  /** Mirrors PASSWORD_MIN_LENGTH so the browser check matches the server's. */
  @property({ type: Number, attribute: "min-password-length" }) minPasswordLength = 8;

  private activeTab = "";
  private isSubmitting = false;

  // Use light DOM so Tailwind classes work
  protected createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.activeTab = this.defaultTab;
    this.setupTabSwitching();
    this.setupFormHandlers();
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

    // Update role selector form attribute if needed
    const roleSelect = this.renderRoot.querySelector(
      "select[name='role']",
    ) as HTMLSelectElement | null;
    if (roleSelect) {
      const formId =
        tab === "passkey" ? "passkey-form" : tab === "pin" ? "pin-form" : "register-form";
      roleSelect.setAttribute("form", formId);
    }
  }

  private setupFormHandlers() {
    // Password form
    const passwordForm = this.querySelector<HTMLFormElement>("#register-form");
    if (passwordForm) {
      passwordForm.addEventListener("submit", (e) => this.handlePasswordSubmit(e));
    }

    // PIN form
    const pinForm = this.querySelector<HTMLFormElement>("#pin-form");
    if (pinForm) {
      pinForm.addEventListener("submit", (e) => this.handlePinSubmit(e));
    }

    // Passkey form
    const passkeyForm = this.querySelector<HTMLFormElement>("#passkey-form");
    if (passkeyForm) {
      passkeyForm.addEventListener("submit", (e) => this.handlePasskeySubmit(e));
    }
  }

  private showError(message: string) {
    const errorContainer = this.querySelector<HTMLDivElement>("#register-error");
    const errorMsg = this.querySelector<HTMLSpanElement>("#register-error-msg");
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
    const confirmPassword = formData.get("confirmPassword") as string;
    const role = formData.get("role") as string;

    // Validation
    if (!email || !password || !confirmPassword) {
      this.showError("All fields are required");
      return;
    }

    if (password !== confirmPassword) {
      this.showError("Passwords do not match");
      return;
    }

    if (password.length < this.minPasswordLength) {
      this.showError(`Password must be at least ${this.minPasswordLength} characters`);
      return;
    }

    this.isSubmitting = true;
    this.disableSubmitButton(form);

    try {
      const response = await api.auth.register.$post({
        json: { email, password, role },
      });

      if (!response.ok) throw new Error(await getErrorMessage(response));

      redirectWithToast("/", "Account created successfully!", "Redirecting...", "success");
    } catch (error: any) {
      this.showError(error.message);
    } finally {
      this.isSubmitting = false;
      this.enableSubmitButton(form);
    }
  }

  private async handlePinSubmit(e: Event) {
    e.preventDefault();
    if (this.isSubmitting) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const email = formData.get("email") as string;
    const pin = formData.get("pin") as string;
    const confirmPin = formData.get("confirmPin") as string;
    const role = formData.get("role") as string;

    // Validation
    if (!email || !pin || !confirmPin) {
      this.showError("All fields are required");
      return;
    }

    if (pin !== confirmPin) {
      this.showError("PINs do not match");
      return;
    }

    if (!/^\d{4,6}$/.test(pin)) {
      this.showError("PIN must be 4-6 digits");
      return;
    }

    this.isSubmitting = true;
    this.disableSubmitButton(form);

    try {
      const response = await api.auth.register.$post({
        json: { email, pin, role },
      });

      if (!response.ok) throw new Error(await getErrorMessage(response));

      redirectWithToast("/", "Account created successfully!", "Redirecting...", "success");
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
    const name = formData.get("name") as string;
    const role = formData.get("role") as string;

    if (!email || !name) {
      this.showError("Email and name are required");
      return;
    }

    this.isSubmitting = true;
    this.disableSubmitButton(form);

    try {
      // 1. Get Options
      const optRes = await api.auth.passkey.register.options.$post({ json: { email } });
      if (optRes.status === 409) throw new Error("Email already registered.");
      if (!optRes.ok) throw new Error(await getErrorMessage(optRes));

      const options = await optRes.json();

      // 2. Browser Interaction
      const attResp = await startRegistration({ optionsJSON: options });

      // 3. Verify
      const verRes = await api.auth.passkey.register.verify.$post({
        json: { email, role, response: attResp, challengeId: options.challengeId },
      });

      if (!verRes.ok) throw new Error(await getErrorMessage(verRes));
      redirectWithToast("/", "Passkey registered successfully!", "Congrats!", "success");
    } catch (error: any) {
      if (error.name === "NotAllowedError") {
        this.showError("Passkey registration was cancelled");
      } else {
        this.showError(error.message);
      }
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
