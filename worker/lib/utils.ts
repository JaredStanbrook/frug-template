/**
 * Parse a user-entered dollar amount into integer cents.
 *
 * Store money as cents. `parseFloat("19.99") * 100` is 1998.9999… — the
 * rounding here is what keeps totals exact.
 */
export function dollarsToCents(input: string): number {
  const num = parseFloat(input);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}
