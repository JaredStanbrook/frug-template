import { html } from "hono/html";

export type ConfirmationVariant = "destructive" | "warning" | "info";

interface ConfirmationDialogProps {
  title: string;
  message: string;
  variant?: ConfirmationVariant;

  // The action to retry
  retryConfig: {
    url: string;
    method?: "post" | "put" | "patch" | "delete";
    payload: Record<string, any>; // The data to resend (including the force/confirm flag)
    target?: string; // ID of the element to update on success
    swap?: string; // How to swap the result
  };
}

const styles = {
  destructive: {
    icon: "skull",
    btnBg: "bg-destructive hover:bg-destructive/90 focus:ring-destructive",
    titleColor: "text-foreground",
    iconBg: "bg-destructive/10 text-destructive",
  },
  warning: {
    icon: "alert-triangle",
    btnBg: "bg-amber-500 hover:bg-amber-600 focus:ring-amber-500",
    titleColor: "text-foreground",
    iconBg: "bg-amber-500/10 text-amber-600",
  },
  info: {
    icon: "info",
    btnBg: "bg-primary hover:bg-primary/90 focus:ring-primary",
    titleColor: "text-foreground",
    iconBg: "bg-primary/10 text-primary",
  },
};

export const ConfirmationDialog = (props: ConfirmationDialogProps) => {
  const { title, message, variant = "warning", retryConfig } = props;
  const style = styles[variant];
  const target = (retryConfig.target || "body").replace(/^['"]|['"]$/g, "");

  // Serialize payload for the hx-vals attribute
  const valsString = JSON.stringify(retryConfig.payload);
  const methodAttribute = `hx-${retryConfig.method || "post"}`;

  return html`
    <div id="modal-container" hx-swap-oob="innerHTML">
      <div
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        aria-labelledby="modal-title"
        role="dialog"
        aria-modal="true"
      >
        <div class="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div
            class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0"
          >
            <div
              class="relative transform overflow-hidden rounded-lg bg-background text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg"
            >
              <div class="bg-background px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <div class="sm:flex sm:items-start">
                  <div
                    class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${style.iconBg} sm:mx-0 sm:h-10 sm:w-10"
                  >
                    <i data-lucide="${style.icon}" class="h-6 w-6"></i>
                  </div>
                  <div class="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <h3
                      class="text-base font-semibold leading-6 ${style.titleColor}"
                      id="modal-title"
                    >
                      ${title}
                    </h3>
                    <div class="mt-2">
                      <p class="text-sm text-muted-foreground">${message}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="bg-muted/40 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  type="button"
                  ${methodAttribute}="${retryConfig.url}"
                  hx-vals="${valsString}"
                  hx-target="${target}"
                  hx-swap="${retryConfig.swap || "innerHTML"}"
                  hx-on::after-request="document.getElementById('modal-container').innerHTML = ''"
                  class="inline-flex w-full justify-center rounded-md ${style.btnBg} px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm sm:ml-3 sm:w-auto"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onclick="document.getElementById('modal-container').innerHTML = ''"
                  class="mt-3 inline-flex w-full justify-center rounded-md bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border hover:bg-muted sm:mt-0 sm:w-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};
