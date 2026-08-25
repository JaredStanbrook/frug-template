import { html, raw } from "hono/html";

export interface SelectionChoice {
  label: string;
  value: string | number;
  description?: string;
  icon?: string;
  // Allow overriding the global submit config per button
  target?: string;
  swap?: string;
}

interface SelectionDialogProps {
  title: string;
  message: string;
  choices: SelectionChoice[];

  submitConfig: {
    url: string;
    method?: "post" | "put" | "patch" | "delete";
    // These become "Defaults" that choices can override
    target?: string;
    swap?: string;
    selectionKey: string;
    payload: Record<string, any>;
  };
}

export const SelectionDialog = (props: SelectionDialogProps) => {
  const { title, message, choices, submitConfig } = props;
  const method = submitConfig.method || "post";
  const methodAttr = `hx-${method}`;

  return html`
    <div id="modal-container" hx-swap-oob="innerHTML">
      <div
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="selection-modal-title"
      >
        <div
          class="bg-background rounded-xl shadow-2xl max-w-lg w-full border border-border overflow-hidden"
        >
          <div class="bg-muted/40 px-6 py-4 border-b border-border flex items-start gap-4">
            <div class="p-2 bg-primary/10 rounded-full text-primary shrink-0">
              <i data-lucide="layers" class="h-6 w-6"></i>
            </div>
            <div>
              <h3 id="selection-modal-title" class="font-bold text-lg text-foreground">${title}</h3>
              <p class="text-sm text-muted-foreground mt-1">${raw(message)}</p>
            </div>
          </div>

          <div class="p-6 space-y-3">
            ${choices.map((choice) => {
              const finalPayload = {
                ...submitConfig.payload,
                [submitConfig.selectionKey]: choice.value,
              };

              // Use choice-specific target/swap if exists, otherwise fallback to config, otherwise default
              const finalTarget = choice.target || submitConfig.target || "body";
              const finalSwap = choice.swap || submitConfig.swap || "innerHTML";

              return html`
                <button
                  type="button"
                  ${methodAttr}="${submitConfig.url}"
                  hx-vals="${JSON.stringify(finalPayload)}"
                  hx-target="${finalTarget}"
                  hx-swap="${finalSwap}"
                  hx-on::after-request="document.getElementById('modal-container').innerHTML = ''"
                  class="w-full text-left group flex items-start gap-4 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  <div class="mt-0.5 shrink-0 text-muted-foreground group-hover:text-primary">
                    ${
                      choice.icon
                        ? html`<i data-lucide="${choice.icon}" class="w-5 h-5"></i>`
                        : html`<div
                            class="w-5 h-5 rounded-full border-2 border-current group-hover:bg-primary group-hover:border-primary transition-colors"
                          ></div>`
                    }
                  </div>
                  <div>
                    <span class="block font-semibold text-foreground group-hover:text-primary">
                      ${choice.label}
                    </span>
                    ${
                      choice.description &&
                      html`
                        <span
                          class="block text-sm text-muted-foreground mt-0.5 group-hover:text-primary/80"
                        >
                          ${choice.description}
                        </span>
                      `
                    }
                  </div>
                </button>
              `;
            })}
          </div>
        </div>
      </div>
    </div>
  `;
};
