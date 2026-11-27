/**
 * Where to send someone after they sign in or register: the `?next=` that the
 * page sending them asked for, if it is a page on this site, otherwise home.
 *
 * Anything else is refused, so the parameter cannot bounce someone to another
 * site straight after they typed a password. A pattern check is not enough:
 * browsers read `//evil.example` and `/\evil.example` as another host, and
 * drop tabs and newlines first, so `/<tab>/evil.example` becomes one too. So
 * this parses the value the way the browser will, and keeps it only if it
 * stays on the same origin.
 */
export const safeNextPath = (value: string | null | undefined): string => {
  if (!value || !value.startsWith("/")) return "/";
  const base = "https://this-site.invalid";
  try {
    const url = new URL(value, base);
    return url.origin === base ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
};

/** `path` with `?next=` carried along, when there is somewhere to go back to. */
export const withNext = (path: string, next: string): string =>
  next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;
