// The pages behind the links the site emails: forgot password, choose a new
// password, and confirm your email.
//
// Server-rendered HTMX forms, no client component. Each card has a stable id
// and its form swaps the whole card for the route's answer, so one view
// serves the first render, the HTMX swap and the plain form post (no JS).

import {
  AUTH_BUTTON,
  AUTH_INPUT,
  AuthField,
  AuthHeading,
  AuthNote,
  describePasswordPolicy,
  type PasswordPolicy,
} from "./authParts";

const CARD =
  "mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px] p-8 border rounded-lg " +
  "shadow-xl bg-card text-card-foreground";

const LINK = "font-medium underline underline-offset-4 hover:text-primary";

/** Same frame as the sign-in page, so moving between them does not jump. */
export const EmailLinkPage = ({ children }: { children?: unknown }) => (
  <div class="max-w-7xl px-4 mx-auto pt-14">
    <div class="container grow flex flex-col items-center justify-center py-12">{children}</div>
  </div>
);

/** A refusal, visible from the start (unlike `AuthError`, which JS reveals). */
const FormAlert = ({ message }: { message?: string }) =>
  message ? (
    <div
      role="alert"
      class="flex items-center gap-2 rounded-lg bg-destructive/15 px-4 py-3 text-sm font-medium text-destructive"
    >
      <i data-lucide="circle-x" class="h-4 w-4 shrink-0" aria-hidden="true"></i>
      <span>{message}</span>
    </div>
  ) : null;

/** hx-* attributes that post a form and swap the card it sits in. */
const swapCard = (action: string, cardId: string) => ({
  method: "post" as const,
  action,
  "hx-post": action,
  "hx-target": `#${cardId}`,
  "hx-swap": "outerHTML",
});

// ==========================================
// FORGOT PASSWORD
// ==========================================

export type ForgotPasswordState =
  | { step: "form"; error?: string; email?: string }
  | { step: "sent"; email: string }
  | { step: "unavailable" };

export const ForgotPasswordCard = (props: ForgotPasswordState) => (
  <div id="forgot-card" class={CARD}>
    {props.step === "form" && (
      <>
        <AuthHeading
          title="Reset your password"
          sub="We will email you a link to choose a new one."
        />
        <FormAlert message={props.error} />
        <form class="grid gap-4" {...swapCard("/forgot-password", "forgot-card")}>
          <AuthField id="forgot-email" label="Email Address">
            <input
              id="forgot-email"
              name="email"
              type="email"
              required
              autocomplete="email"
              value={props.email}
              class={AUTH_INPUT}
              placeholder="you@example.com"
            />
          </AuthField>
          <button type="submit" class={AUTH_BUTTON}>
            Email me a link
          </button>
        </form>
      </>
    )}

    {props.step === "sent" && (
      <>
        <AuthHeading title="Check your email" sub={props.email} />
        <p class="text-sm text-muted-foreground">
          If an account uses this address, a link to reset its password is on its way. It works
          once, within an hour. Nothing after a few minutes? Check your spam folder, or ask again.
        </p>
      </>
    )}

    {props.step === "unavailable" && (
      <>
        <AuthHeading title="Reset your password" sub="Not available on this site yet" />
        <AuthNote icon="info">
          This site cannot send email yet, so it cannot send a reset link. Ask whoever runs it to
          help you back in.
        </AuthNote>
      </>
    )}

    <p class="text-center text-sm text-muted-foreground">
      <a href="/login" class={LINK}>
        Back to sign in
      </a>
    </p>
  </div>
);

// ==========================================
// CHOOSE A NEW PASSWORD
// ==========================================

export type ResetPasswordState =
  { step: "form"; token: string; policy?: PasswordPolicy; error?: string } | { step: "done" };

export const ResetPasswordCard = (props: ResetPasswordState) => {
  if (props.step === "done") {
    return (
      <div id="reset-card" class={CARD}>
        <AuthHeading title="Password changed" sub="Sign in with your new password." />
        <p class="text-sm text-muted-foreground">
          Every device that was signed in to your account has been signed out.
        </p>
        <a href="/login" class={AUTH_BUTTON}>
          Sign in
        </a>
      </div>
    );
  }

  const hint = describePasswordPolicy(props.policy);
  const minLength = props.policy?.minLength ?? 8;
  return (
    <div id="reset-card" class={CARD}>
      <AuthHeading title="Choose a new password" sub="Then sign in with it." />
      <FormAlert message={props.error} />
      <form class="grid gap-4" {...swapCard("/reset-password", "reset-card")}>
        <input type="hidden" name="token" value={props.token} />
        <AuthField id="new-password" label="New Password">
          <input
            id="new-password"
            name="password"
            type="password"
            required
            minlength={minLength}
            autocomplete="new-password"
            aria-describedby={hint ? "reset-policy" : undefined}
            class={AUTH_INPUT}
            placeholder="••••••••"
          />
          {hint ? (
            <p id="reset-policy" class="text-xs text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </AuthField>
        <AuthField id="confirm-password" label="Confirm Password">
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            required
            minlength={minLength}
            autocomplete="new-password"
            class={AUTH_INPUT}
            placeholder="••••••••"
          />
        </AuthField>
        <button type="submit" class={AUTH_BUTTON}>
          Change password
        </button>
      </form>
      <p class="text-center text-sm text-muted-foreground">
        Link expired?{" "}
        <a href="/forgot-password" class={LINK}>
          Ask for a new one
        </a>
      </p>
    </div>
  );
};

// ==========================================
// CONFIRM YOUR EMAIL
// ==========================================

export type VerifyEmailState =
  /** Opened from the email: one button, so a mail scanner's visit confirms nothing. */
  | { step: "confirm"; token: string }
  /** Signed in, not confirmed yet. `notice` reports a resend. */
  | { step: "pending"; email: string; notice?: string; required: boolean; canSend: boolean }
  | { step: "done"; signedIn: boolean }
  | { step: "invalid"; message: string; signedIn: boolean; canResend: boolean };

const ResendForm = () => (
  <form {...swapCard("/verify-email/resend", "verify-card")}>
    <button type="submit" class={AUTH_BUTTON}>
      Send the link again
    </button>
  </form>
);

const SignOut = () => (
  <form hx-post="/web/auth/logout" class="text-center">
    <button
      type="submit"
      class={`inline-flex h-11 items-center text-sm text-muted-foreground ${LINK}`}
    >
      Sign out
    </button>
  </form>
);

export const VerifyEmailCard = (props: VerifyEmailState) => (
  <div id="verify-card" class={CARD}>
    {props.step === "confirm" && (
      <>
        <AuthHeading title="Confirm your email" sub="One click and it is done." />
        <form class="grid" {...swapCard("/verify-email", "verify-card")}>
          <input type="hidden" name="token" value={props.token} />
          <button type="submit" class={AUTH_BUTTON}>
            Confirm my email
          </button>
        </form>
      </>
    )}

    {props.step === "pending" && (
      <>
        <AuthHeading title="Confirm your email" sub={props.email} />
        {props.canSend ? (
          <p class="text-sm text-muted-foreground">
            We sent a link to this address. Open it to confirm the address is yours
            {props.required ? ", then carry on where you left off." : "."} Nothing after a few
            minutes? Check your spam folder, or send it again.
          </p>
        ) : (
          <AuthNote icon="info">
            This site cannot send email yet, so no link was sent. If you run the site, see "Email"
            in docs/deploy.md.
          </AuthNote>
        )}
        {props.notice ? (
          <p role="status" class="rounded-lg bg-muted p-4 text-sm">
            {props.notice}
          </p>
        ) : null}
        {props.canSend ? <ResendForm /> : null}
        <SignOut />
      </>
    )}

    {props.step === "done" && (
      <>
        <AuthHeading title="Email confirmed" sub="Thank you." />
        <a href={props.signedIn ? "/" : "/login"} class={AUTH_BUTTON}>
          {props.signedIn ? "Continue" : "Sign in"}
        </a>
      </>
    )}

    {props.step === "invalid" && (
      <>
        <AuthHeading title="Confirm your email" sub="That link did not work" />
        <FormAlert message={props.message} />
        {props.canResend ? (
          <ResendForm />
        ) : (
          <p class="text-center text-sm text-muted-foreground">
            {props.signedIn ? (
              <a href="/" class={LINK}>
                Continue
              </a>
            ) : (
              <>
                <a href="/login" class={LINK}>
                  Sign in
                </a>{" "}
                to have a new link sent.
              </>
            )}
          </p>
        )}
      </>
    )}
  </div>
);
