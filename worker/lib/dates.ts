/**
 * Calendar dates as plain `YYYY-MM-DD` strings, not timestamps.
 *
 * A due date, a booking day, a deadline — these are calendar days ("the 15th"),
 * not instants. Storing one as a timestamp makes it drift across time zones:
 * something due on the 15th in London is due on the 14th in New York, which is
 * not a thing anybody means.
 *
 * Use these for anything a human would call a date. For "when did this
 * happen", keep a full ISO timestamp instead.
 */

/**
 * Today as `YYYY-MM-DD`, in UTC unless a time zone is given.
 *
 * "Today" is the one place the zone matters: in Perth, the UTC date is still
 * yesterday until 8am, so a "what's due today" screen built on UTC shows the
 * wrong day every morning. Pass `c.var.app.timezone` (APP_TIMEZONE) for
 * anything a person reads as "today"; the arithmetic below stays in UTC.
 */
export const today = (timeZone?: string): string => {
  if (!timeZone) return new Date().toISOString().slice(0, 10);
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

/**
 * Add whole days to a `YYYY-MM-DD` date.
 *
 * Built via `Date.UTC` so the arithmetic never crosses a daylight-saving
 * boundary — in local time, adding 7 days to a date near a clock change can
 * land 23 or 25 hours out and roll into the wrong day.
 */
export const addDays = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
};

/** Negative when `isoDate` is in the past, so `< 0` reads as "overdue". */
export const daysUntil = (isoDate: string, from: string = today()): number => {
  const [ay, am, ad] = isoDate.split("-").map(Number);
  const [by, bm, bd] = from.split("-").map(Number);
  const ms = Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd);
  return Math.round(ms / 86_400_000);
};

/** Pass `from` (e.g. `today(zone)`) so "overdue" follows the site's day. */
export const isOverdue = (isoDate: string, from: string = today()): boolean =>
  daysUntil(isoDate, from) < 0;

/**
 * "due today", "due in 3 days", "5 days overdue" — plain enough to read at a
 * glance, and the wording most deadline UIs want. Swap the verb per feature if
 * "due" is wrong for yours.
 */
export const relativeDueLabel = (isoDate: string, from: string = today()): string => {
  const days = daysUntil(isoDate, from);
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `due in ${days} days`;
};
