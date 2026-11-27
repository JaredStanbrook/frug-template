import type { FC } from "hono/jsx";
import { withNext } from "@server/lib/next-path";
import {
  AUTH_BUTTON,
  AUTH_INPUT,
  AUTH_TAB,
  AuthError,
  AuthField,
  AuthHeading,
  AuthNote,
  gridColsFor,
} from "./authParts";

export interface LoginProps {
  methods: string[];
  csrfToken?: string;
  /** Hide the sign-up link when nobody could use it (SINGLE_ACCOUNT). */
  registrationOpen?: boolean;
  /** Offer "Forgot password?" only where a reset link can be sent. */
  passwordReset?: boolean;
  /** Where to return after signing in; carried to the sign-up link too. */
  next?: string;
}

export const Login: FC<LoginProps> = (props) => {
  const { methods, csrfToken, registrationOpen = true, passwordReset = true, next = "/" } = props;
  // <auth-login> sends these forms to the API itself. Until its script has
  // loaded, the browser would submit them natively: as a GET, with the
  // password in the URL. POST keeps it out of the address bar, history and
  // logs, and the server's POST /login only sends them back to try again.
  const fallback = { method: "post", action: withNext("/login", next) } as const;

  const hasPassword = methods.includes("password");
  const hasPin = methods.includes("pin");
  const hasPasskey = methods.includes("passkey");

  // Count the tabs that actually render, not the enabled methods. Not every
  // method is a tab — `totp` is a second step after one of these, never a
  // choice on this screen — so a config of "password,passkey,totp" draws two
  // tabs. Sizing the grid by `methods.length` left a third empty column, and
  // "password,totp" drew a one-tab strip.
  const tabCount = [hasPassword, hasPin, hasPasskey].filter(Boolean).length;
  const multipleAuthMethods = tabCount > 1;

  const defaultTab = hasPassword ? "password" : hasPin ? "pin" : "passkey";

  return (
    <div class="max-w-7xl px-4 mx-auto pt-14">
      <div class="container grow flex flex-col items-center justify-center py-12">
        <auth-login
          class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px] p-8 border rounded-lg shadow-xl bg-card text-card-foreground"
          default-tab={defaultTab}
          csrf-token={csrfToken || ""}
          hx-disable="true"
        >
          <AuthHeading title="Welcome Back" sub="Sign in to your account" />

          <AuthError id="login-error" />

          {/* Tab triggers */}
          {multipleAuthMethods && (
            <div class={`grid w-full ${gridColsFor(tabCount)} rounded-lg bg-muted p-1`} slot="tabs">
              {hasPassword && (
                <button type="button" data-tab="password" class={AUTH_TAB}>
                  Password
                </button>
              )}
              {hasPin && (
                <button type="button" data-tab="pin" class={AUTH_TAB}>
                  PIN
                </button>
              )}
              {hasPasskey && (
                <button type="button" data-tab="passkey" class={AUTH_TAB}>
                  Passkey
                </button>
              )}
            </div>
          )}

          {/* Password tab content */}
          {hasPassword && (
            <div data-content="password" class="space-y-4">
              <form id="login-form" {...fallback} class="grid gap-4">
                {csrfToken && <input type="hidden" name="_csrf" value={csrfToken} />}

                <AuthField id="email" label="Email Address">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    class={AUTH_INPUT}
                    placeholder="you@example.com"
                  />
                </AuthField>

                <AuthField
                  id="password"
                  label="Password"
                  extra={
                    passwordReset && (
                      <a
                        href="/forgot-password"
                        class="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                      >
                        Forgot password?
                      </a>
                    )
                  }
                >
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    class={AUTH_INPUT}
                    placeholder="••••••••"
                  />
                </AuthField>

                <button class={AUTH_BUTTON}>Sign In</button>
              </form>
            </div>
          )}

          {/* PIN tab content */}
          {hasPin && (
            <div data-content="pin" class="space-y-4 hidden">
              <form id="pin-login-form" {...fallback} class="grid gap-4">
                {csrfToken && <input type="hidden" name="_csrf" value={csrfToken} />}

                <AuthField id="pin-email" label="Email Address">
                  <input
                    id="pin-email"
                    name="email"
                    type="email"
                    required
                    class={AUTH_INPUT}
                    placeholder="you@example.com"
                  />
                </AuthField>

                <AuthField id="pin" label="PIN">
                  <input
                    id="pin"
                    name="pin"
                    type="password"
                    required
                    inputmode="numeric"
                    pattern="\d{4,6}"
                    maxlength={6}
                    class={AUTH_INPUT}
                    placeholder="••••"
                  />
                </AuthField>

                <button type="submit" class={AUTH_BUTTON}>
                  Sign In
                </button>
              </form>
            </div>
          )}

          {/* Passkey tab content */}
          {hasPasskey && (
            <div data-content="passkey" class="space-y-4 hidden">
              <AuthNote icon="key-round">Use your passkey to sign in securely.</AuthNote>

              <form id="passkey-login-form" {...fallback} class="grid gap-4">
                {csrfToken && <input type="hidden" name="_csrf" value={csrfToken} />}

                <AuthField id="pk-email" label="Email Address">
                  <input
                    id="pk-email"
                    name="email"
                    type="email"
                    required
                    class={AUTH_INPUT}
                    placeholder="you@example.com"
                  />
                </AuthField>

                <button type="submit" class={AUTH_BUTTON}>
                  Sign In with Passkey
                </button>
              </form>
            </div>
          )}
          <totp-verify-modal></totp-verify-modal>
        </auth-login>

        {registrationOpen ? (
          <p class="px-8 mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <a
              href={withNext("/register", next)}
              class="underline underline-offset-4 hover:text-primary font-medium"
            >
              Create Account
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
};
