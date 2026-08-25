import { html } from "hono/html";

/**
 * Presentation helpers for views.
 *
 * Locale and currency are per-site (APP_LOCALE / APP_CURRENCY in
 * wrangler.jsonc, surfaced as `c.var.app`), so they are passed in rather than
 * baked in. Formatters are memoised because Intl construction is not free and
 * a table renders hundreds of cells per request.
 */

const DEFAULT_LOCALE = "en-AU";
const DEFAULT_CURRENCY = "AUD";

const currencyFormatters = new Map<string, Intl.NumberFormat>();

const getCurrencyFormatter = (locale = DEFAULT_LOCALE, currency = DEFAULT_CURRENCY) => {
  const key = `${locale}:${currency}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter;
};

export const capitalize = (str: string): string => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const formatDateShort = (date: Date | string | number, locale = DEFAULT_LOCALE) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const formatDateCompact = (date: Date | string | number, locale = DEFAULT_LOCALE) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
};

/**
 * Money is stored as integer cents everywhere. Never round-trip it through a
 * float — convert at the edges with these two helpers only.
 */
export const formatCents = (
  cents: number | undefined | null,
  locale = DEFAULT_LOCALE,
  currency = DEFAULT_CURRENCY,
): string => {
  const formatter = getCurrencyFormatter(locale, currency);
  if (cents === undefined || cents === null) return formatter.format(0);
  return formatter.format(cents / 100);
};

export const dollarsToCents = (value: string | number | undefined | null): number => {
  if (value === undefined || value === null || value === "") return 0;
  const num = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
};

export const StatusBadge = (status: string, styles: Record<string, string>, iconName?: string) => {
  // Format label: "pending_review" -> "Pending Review"
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  const style = styles[status] || styles.default || "bg-muted text-muted-foreground border-border";

  return html`
    <span
      class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style}"
    >
      ${iconName ? html`<i data-lucide="${iconName}" class="w-3 h-3 mr-1.5"></i>` : ""} ${label}
    </span>
  `;
};
