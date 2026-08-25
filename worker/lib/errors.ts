/**
 * Turning a thrown value into something safe to return and something useful
 * to log.
 *
 * Two failures this exists to prevent, both seen in practice:
 *
 *  1. Drizzle wraps a D1 failure as `Failed query: <the entire SQL>` and hangs
 *     the real reason ("no such table: users") off `.cause`. Returning that
 *     message verbatim hands an unauthenticated caller the schema and tells
 *     them nothing they can act on.
 *  2. The real reason never reached the logs, so the operator had nothing to
 *     go on either.
 */

/** Flatten an error and its `cause` chain into one loggable line. */
export function describeError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;

  // Bounded, because a cause chain can in principle be cyclic.
  for (let depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error) {
      parts.push(`${current.name}: ${current.message}`);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }

  return parts.join("  <- ");
}

/**
 * Did this come from the infrastructure rather than from our own validation?
 *
 * Everything the auth and feature services throw deliberately is a plain
 * `new Error("Email already registered")` — no `cause`, no SQL. A wrapped
 * driver error has one or both. Misclassifying in this direction is the safe
 * way round: the caller sees a generic message instead of a specific one.
 */
export function isInternalError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  if (err.cause !== undefined) return true;
  return /^Failed query:|D1_ERROR|no such (table|column)/i.test(err.message);
}

/** True when the database has no schema — i.e. migrations never ran. */
export function isMissingSchema(err: unknown): boolean {
  return /no such (table|column)/i.test(describeError(err));
}

/**
 * The message to return to a caller.
 *
 * The missing-schema case gets a specific message on purpose. It only happens
 * before a site has been set up, it discloses nothing an attacker can use, and
 * the alternative — the opaque failure this module was written for — costs
 * whoever is deploying a great deal of time.
 */
export function toClientMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!isInternalError(err)) return (err as Error).message;
  if (isMissingSchema(err)) {
    return "The database has not been set up yet. Apply the migrations, then try again.";
  }
  return fallback;
}

/**
 * Log the full detail and hand back the safe message. Logs surface in
 * `wrangler tail` and in the dashboard under Workers Logs, since
 * `observability` is enabled in wrangler.jsonc.
 */
export function logAndSanitise(context: string, err: unknown, fallback?: string): string {
  if (isInternalError(err)) {
    console.error(`[${context}] ${describeError(err)}`);
  }
  return toClientMessage(err, fallback);
}
