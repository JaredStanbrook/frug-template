// Pieces shared by the sign-in and registration pages.
//
// They are near-identical screens, and this template used to carry two copies
// of the same markup. That is how one of them ended up with a tab strip that
// did not lay out while the other looked fine — a fix applied to one copy, or
// a bug introduced in one copy, simply did not reach the other. One definition
// each, used by both.

/**
 * The tab strip's column count, as a complete class name.
 *
 * Both pages previously wrote `grid-cols-${methods.length}` inside a plain
 * (non-template) JSX string, so the literal text `grid-cols-${methods.length}`
 * was emitted as a class. Tailwind generates classes by scanning source text
 * for complete names, so it never produced that one and the tabs stacked
 * vertically instead of sitting side by side.
 *
 * This is the single most repeated trap in this codebase: an interpolated
 * Tailwind class does not exist. Write the whole name, or map to it.
 */
export const gridColsFor = (count: number) => (count >= 3 ? "grid-cols-3" : "grid-cols-2");

/**
 * A tab trigger. `data-state="active"` is set by the auth Lit elements — see
 * `worker/components/auth/AuthLogin.ts` — so the styling hook has to stay.
 *
 * `h-11` is 44px: the minimum touch target, and worth defending on the one
 * screen every user meets before they have any investment in the product.
 */
export const AUTH_TAB =
  "tab-btn inline-flex h-11 items-center justify-center whitespace-nowrap rounded-lg px-3 " +
  "text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 " +
  "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

export const AUTH_INPUT =
  "flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm " +
  "ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export const AUTH_BUTTON =
  "inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-lg px-4 " +
  "text-sm font-medium bg-primary text-primary-foreground transition-colors hover:bg-primary/90 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "disabled:pointer-events-none disabled:opacity-50";

export const AuthField = ({
  id,
  label,
  extra,
  children,
}: {
  id: string;
  label: string;
  extra?: unknown;
  children?: unknown;
}) => (
  <div class="grid gap-2">
    <div class="flex items-center justify-between gap-2">
      <label class="text-sm font-medium leading-none" for={id}>
        {label}
      </label>
      {extra}
    </div>
    {children}
  </div>
);

/**
 * Hidden until the auth element fills it in; `role="alert"` so it is announced.
 *
 * `hidden` and `flex` are both here on purpose. The auth elements reveal this
 * by removing `hidden` alone (see `AuthLogin.ts`), so whatever display the
 * element should end up with has to be on it already.
 */
export const AuthError = ({ id }: { id: string }) => (
  <div
    id={id}
    role="alert"
    class="hidden flex items-center gap-2 rounded-lg bg-destructive/15 px-4 py-3 text-sm font-medium text-destructive"
  >
    <i data-lucide="circle-x" class="h-4 w-4 shrink-0" aria-hidden="true"></i>
    <span id={`${id}-msg`}></span>
  </div>
);

export const AuthNote = ({ icon, children }: { icon: string; children?: unknown }) => (
  <p class="mb-2 flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
    <i data-lucide={icon} class="h-4 w-4 shrink-0" aria-hidden="true"></i>
    {children}
  </p>
);

export const AuthHeading = ({ title, sub }: { title: string; sub: string }) => (
  <div class="flex flex-col space-y-2 text-center">
    <h1 class="text-3xl font-bold tracking-tight">{title}</h1>
    <p class="text-sm text-muted-foreground">{sub}</p>
  </div>
);

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

/**
 * The configured password rule, in a sentence, for the form to show up front.
 *
 * Same rule the server enforces (`assertPasswordPolicy`), read from the same
 * config — so the two cannot drift into telling the user different things.
 */
export const describePasswordPolicy = (policy?: PasswordPolicy) => {
  if (!policy) return "";

  const extras: string[] = [];
  if (policy.requireUppercase) extras.push("a capital letter");
  if (policy.requireLowercase) extras.push("a lowercase letter");
  if (policy.requireNumbers) extras.push("a number");
  if (policy.requireSpecialChars) extras.push("a symbol");

  const base = `At least ${policy.minLength} characters`;
  if (extras.length === 0) {
    return `${base}. Length matters more than punctuation — a passphrase works well.`;
  }
  return `${base}, including ${extras.join(", ")}.`;
};
