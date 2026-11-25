// worker/config/cookies.config.ts
//
// Every cookie (and every item in local storage) this site sets, and the
// category each belongs to. The cookie banner, the preferences dialog and
// the /cookies page are all built from this list, so it is the one place to
// add a cookie: a site that adds analytics adds its cookie here, under
// "performance", and loads the analytics only once that category is allowed
// (`allows(c, "performance")` on the server, `cookieConsent.allows(...)` in
// the browser; see worker/lib/consent.ts).

export const COOKIE_CATEGORIES = ["necessary", "functional", "performance", "targeting"] as const;
export type CookieCategory = (typeof COOKIE_CATEGORIES)[number];
/** The categories a visitor may switch off. */
export type OptionalCategory = Exclude<CookieCategory, "necessary">;
export const OPTIONAL_CATEGORIES: OptionalCategory[] = ["functional", "performance", "targeting"];

export const CATEGORY_INFO: Record<CookieCategory, { label: string; description: string }> = {
  necessary: {
    label: "Strictly necessary",
    description:
      "Keep the site working: signing in, carrying a message to the next page, remembering these choices. They cannot be switched off.",
  },
  functional: {
    label: "Functional",
    description: "Remember choices you make, such as light or dark mode.",
  },
  performance: {
    label: "Performance",
    description:
      "Count visits and find slow pages, so the site can be improved. Nothing names you.",
  },
  targeting: {
    label: "Targeting",
    description: "Set by advertising partners to show you relevant adverts on other sites.",
  },
};

export interface CookieEntry {
  name: string;
  category: CookieCategory;
  /** What it does, in a sentence a visitor understands. */
  purpose: string;
  /** How long it lasts. */
  duration: string;
  /** Where it lives. Cookies by default. */
  storage?: "cookie" | "local storage";
}

export const COOKIES: CookieEntry[] = [
  {
    name: "auth_token",
    category: "necessary",
    purpose: "Keeps you signed in.",
    duration: "Until you sign out, or your session ends",
  },
  {
    name: "flash-toast",
    category: "necessary",
    purpose: "Carries a short message, such as “Saved”, to the next page.",
    duration: "5 seconds",
  },
  {
    name: "site_access",
    category: "necessary",
    purpose: "Lets an invited visitor in while the site is private.",
    duration: "As long as the invitation lasts",
  },
  {
    name: "cookie_consent",
    category: "necessary",
    purpose: "Remembers the cookie choices you make here.",
    duration: "6 months",
  },
  {
    name: "vite-ui-theme",
    category: "functional",
    purpose: "Remembers whether you chose light, dark or your device's mode.",
    duration: "Until you clear it",
    storage: "local storage",
  },
];

/**
 * The optional categories this site offers, from COOKIE_CATEGORIES
 * ("functional,performance,targeting"; unset means all three). List only the
 * ones the site really uses. Empty means the site sets only strictly
 * necessary cookies, which need no consent, and no banner is shown.
 */
export function offeredCategories(env: { COOKIE_CATEGORIES?: string }): OptionalCategory[] {
  const raw = env.COOKIE_CATEGORIES;
  if (raw === undefined) return [...OPTIONAL_CATEGORIES];
  const wanted = new Set(raw.split(",").map((s) => s.trim().toLowerCase()));
  return OPTIONAL_CATEGORIES.filter((c) => wanted.has(c));
}
