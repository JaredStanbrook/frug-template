// worker/config/app.config.ts

/**
 * Per-site branding and formatting, driven entirely by Cloudflare vars.
 *
 * This is the one place a new site has to be named. Everything that renders
 * a product name, tagline, currency or date reads from here, so spinning up
 * a new worker is a `wrangler.jsonc` edit rather than a find-and-replace.
 */
export interface AppConfig {
  name: string;
  tagline: string;
  /** BCP 47 tag used for date and currency formatting, e.g. "en-AU". */
  locale: string;
  /** ISO 4217 code used by the currency formatters, e.g. "AUD". */
  currency: string;
  /** Absolute origin the site is served from, used for links in emails/PDFs. */
  origin: string;
}

export function parseAppConfig(env: any): AppConfig {
  return {
    name: env.APP_NAME || "Frug",
    tagline: env.APP_TAGLINE || "",
    locale: env.APP_LOCALE || "en-AU",
    currency: env.APP_CURRENCY || "AUD",
    origin: env.ORIGIN || "http://localhost:3000",
  };
}
