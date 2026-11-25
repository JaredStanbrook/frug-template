// worker/views/components/CookieConsent.tsx
//
// The cookie banner and the preferences dialog. Both post to /cookies
// (worker/routes/cookies.tsx), which saves the choice and sends this block
// back re-rendered, so the banner goes once a choice is made. Without
// JavaScript the forms post normally and the visitor lands back where they
// were; "Cookie preferences" is then a link to the /cookies page.
//
// The banner sits along the bottom of the screen and covers nothing else: no
// overlay, no blocked page. The dialog opens only when asked for.

import type { FC } from "hono/jsx";
import {
  CATEGORY_INFO,
  COOKIES,
  type CookieCategory,
  type OptionalCategory,
} from "../../config/cookies.config";
import type { Consent } from "../../lib/consent";

const button =
  "inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primary = `${button} bg-primary text-primary-foreground hover:bg-primary/90`;
const outline = `${button} border border-input bg-background hover:bg-accent hover:text-accent-foreground`;

/** The posting attributes both forms share. */
const formAttrs = {
  method: "post" as const,
  action: "/cookies",
  "hx-post": "/cookies",
  "hx-target": "#cookie-consent",
  "hx-swap": "outerHTML",
};

/** A switch: a checkbox drawn as a sliding toggle, 44 px tall to tap. */
const Toggle = ({ name, checked, label }: { name: string; checked: boolean; label: string }) => (
  <label class="relative inline-flex h-11 shrink-0 cursor-pointer items-center">
    <input type="checkbox" name={name} value="on" checked={checked} class="peer sr-only" />
    <span class="sr-only">{label}</span>
    <span
      class="h-6 w-11 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
      aria-hidden="true"
    ></span>
    <span
      class="absolute left-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-5"
      aria-hidden="true"
    ></span>
  </label>
);

const CookieList = ({ category }: { category: CookieCategory }) => {
  const list = COOKIES.filter((c) => c.category === category);
  return (
    <details class="mt-2 text-sm">
      <summary class="inline-flex min-h-11 cursor-pointer items-center font-medium text-muted-foreground hover:text-foreground">
        {list.length ? `${list.length} used on this site` : "None used on this site yet"}
      </summary>
      {list.length ? (
        <ul class="mt-1 space-y-2 border-l-2 border-border pl-3">
          {list.map((c) => (
            <li>
              <code class="text-foreground">{c.name}</code>
              {c.storage === "local storage" ? " (local storage)" : ""}: {c.purpose}{" "}
              <span class="text-muted-foreground">{c.duration}.</span>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
};

/** Every category, each with its switch, and the buttons to save. */
export const CookiePreferencesForm = ({
  offered,
  consent,
}: {
  offered: OptionalCategory[];
  consent: Consent | null;
}) => (
  <form {...formAttrs} class="space-y-1">
    <section class="border-b border-border py-3">
      <div class="flex items-center justify-between gap-4">
        <h3 class="font-semibold">{CATEGORY_INFO.necessary.label}</h3>
        <span class="text-sm font-medium text-muted-foreground">Always on</span>
      </div>
      <p class="mt-1 text-sm text-muted-foreground">{CATEGORY_INFO.necessary.description}</p>
      <CookieList category="necessary" />
    </section>
    {offered.map((cat) => (
      <section class="border-b border-border py-3">
        <div class="flex items-center justify-between gap-4">
          <h3 class="font-semibold">{CATEGORY_INFO[cat].label}</h3>
          <Toggle
            name={cat}
            checked={consent?.[cat] ?? false}
            label={`Allow ${CATEGORY_INFO[cat].label.toLowerCase()} cookies`}
          />
        </div>
        <p class="mt-1 text-sm text-muted-foreground">{CATEGORY_INFO[cat].description}</p>
        <CookieList category={cat} />
      </section>
    ))}
    <div class="flex flex-wrap justify-end gap-2 pt-4">
      <button type="submit" name="choice" value="reject" class={outline}>
        Reject all
      </button>
      <button type="submit" name="choice" value="custom" class={outline}>
        Confirm my choices
      </button>
      <button type="submit" name="choice" value="accept" class={primary}>
        Accept all
      </button>
    </div>
  </form>
);

/**
 * The banner (until a choice is made) and the dialog behind "Cookie
 * preferences". Renders nothing when the site offers no optional category.
 */
export const CookieConsent: FC<{ offered: OptionalCategory[]; consent: Consent | null }> = ({
  offered,
  consent,
}) =>
  offered.length === 0 ? (
    <div id="cookie-consent"></div>
  ) : (
    <div id="cookie-consent">
      {consent ? null : (
        // Room at the foot of the page, so the fixed banner covers nothing
        // that cannot be scrolled clear of it.
        <div class="h-56 md:h-24" aria-hidden="true"></div>
      )}
      {consent ? null : (
        <section
          class="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-popover text-popover-foreground shadow-lg"
          aria-label="Cookies"
        >
          <div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:gap-6">
            <p class="text-sm leading-relaxed md:flex-1">
              We use cookies to keep this site working and, if you agree, to remember your settings
              and see how the site is used.{" "}
              <a href="/cookies" class="underline underline-offset-4 hover:text-foreground">
                Cookie policy
              </a>
            </p>
            <form {...formAttrs} class="flex flex-wrap items-center gap-2">
              <a href="/cookies" data-cookie-preferences class={outline}>
                Cookie preferences
              </a>
              <button type="submit" name="choice" value="reject" class={outline}>
                Reject all
              </button>
              <button type="submit" name="choice" value="accept" class={primary}>
                Accept all cookies
              </button>
            </form>
          </div>
        </section>
      )}
      <dialog
        id="cookie-preferences"
        aria-labelledby="cookie-preferences-title"
        class="m-auto w-[min(36rem,calc(100%-2rem))] max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-lg backdrop:bg-foreground/40"
      >
        <div class="p-5 sm:p-6">
          <div class="flex items-start justify-between gap-4">
            <h2 id="cookie-preferences-title" class="text-xl font-semibold">
              Cookie preferences
            </h2>
            <form method="dialog">
              <button
                class="-mr-2 -mt-2 inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-accent"
                aria-label="Close"
              >
                <i data-lucide="x" class="h-5 w-5"></i>
              </button>
            </form>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">
            Choose which cookies this site may use. You can change this at any time from “Cookie
            preferences” at the foot of every page.
          </p>
          <CookiePreferencesForm offered={offered} consent={consent} />
        </div>
      </dialog>
    </div>
  );
