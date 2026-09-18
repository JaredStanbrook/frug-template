import type { FC } from "hono/jsx";
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
}

export const Login: FC<LoginProps> = (props) => {
  const { methods, csrfToken } = props;

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
              <form id="login-form" class="grid gap-4">
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
                    <a
                      href="/forgot-password"
                      class="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </a>
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
              <form id="pin-login-form" class="grid gap-4">
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

              <form id="passkey-login-form" class="grid gap-4">
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

        <p class="px-8 mt-6 text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <a href="/register" class="underline underline-offset-4 hover:text-primary font-medium">
            Create Account
          </a>
        </p>
      </div>
    </div>
  );
};
