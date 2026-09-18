import type { FC } from "hono/jsx";
import {
  AUTH_BUTTON,
  AUTH_INPUT,
  AUTH_TAB,
  AuthError,
  AuthField,
  AuthHeading,
  AuthNote,
  describePasswordPolicy,
  gridColsFor,
} from "./authParts";
import type { PasswordPolicy } from "./authParts";

export interface RegisterProps {
  methods: string[];
  roles: readonly string[];
  defaultRole: string;
  csrfToken?: string;
  passwordPolicy?: PasswordPolicy;
}

export const Register: FC<RegisterProps> = (props) => {
  const { methods, roles, defaultRole, csrfToken, passwordPolicy } = props;
  const minLength = passwordPolicy?.minLength ?? 8;
  const policyHint = describePasswordPolicy(passwordPolicy);

  const hasPassword = methods.includes("password");
  const hasPin = methods.includes("pin");
  const hasPasskey = methods.includes("passkey");
  const showRoleSelector = roles.length > 1;

  // The number of tabs that render, which is not the number of enabled
  // methods — see the note in Login.tsx.
  const tabCount = [hasPassword, hasPin, hasPasskey].filter(Boolean).length;
  const multipleAuthMethods = tabCount > 1;

  // Determine default tab
  const defaultTab = hasPassword ? "password" : hasPin ? "pin" : "passkey";

  return (
    <div class="max-w-7xl px-4 mx-auto pt-14">
      <div class="container grow flex flex-col items-center justify-center py-12">
        <auth-register
          class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px] p-8 border rounded-lg shadow-xl bg-card text-card-foreground"
          default-tab={defaultTab}
          csrf-token={csrfToken || ""}
          min-password-length={minLength}
          hx-disable="true"
        >
          <AuthHeading title="Create Account" sub="Get started with our platform" />

          <AuthError id="register-error" />

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

          {/* Shared role selector. The label carries `for` so that tapping it
              focuses the select and a screen reader announces the two together
              — it used to be a bare <label> beside an id-less <select>. */}
          {showRoleSelector && (
            <AuthField id="role" label="I want to join as a...">
              <select id="role" name="role" form="register-form" class={AUTH_INPUT}>
                {roles.map((role) => (
                  <option value={role} selected={role === defaultRole} class="capitalize">
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
            </AuthField>
          )}
          {!showRoleSelector && (
            <input type="hidden" name="role" value={defaultRole} form="register-form" />
          )}

          {/* Password tab content */}
          {hasPassword && (
            <div data-content="password" class="space-y-4">
              <form id="register-form" class="grid gap-4">
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

                <AuthField id="password" label="Password">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minlength={minLength}
                    aria-describedby={policyHint ? "password-policy" : undefined}
                    class={AUTH_INPUT}
                    placeholder="••••••••"
                  />
                  {policyHint ? (
                    <p id="password-policy" class="text-xs text-muted-foreground">
                      {policyHint}
                    </p>
                  ) : null}
                </AuthField>

                <AuthField id="confirmPassword" label="Confirm Password">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    minlength={minLength}
                    class={AUTH_INPUT}
                    placeholder="••••••••"
                  />
                </AuthField>

                <button type="submit" class={AUTH_BUTTON}>
                  Create Account
                </button>
              </form>
            </div>
          )}

          {/* PIN tab content */}
          {hasPin && (
            <div data-content="pin" class="space-y-4 hidden">
              <form id="pin-form" class="grid gap-4">
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

                <AuthField id="pin" label="PIN (4-6 digits)">
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

                <AuthField id="confirmPin" label="Confirm PIN">
                  <input
                    id="confirmPin"
                    name="confirmPin"
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
                  Create Account
                </button>
              </form>
            </div>
          )}

          {/* Passkey tab content */}
          {hasPasskey && (
            <div data-content="passkey" class="space-y-4 hidden">
              <AuthNote icon="key-round">
                Passkeys verify your identity using your fingerprint, face, or device PIN.
              </AuthNote>

              <form id="passkey-form" class="grid gap-4">
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

                <AuthField id="pk-name" label="Display Name">
                  <input
                    id="pk-name"
                    name="name"
                    type="text"
                    required
                    class={AUTH_INPUT}
                    placeholder="Your Name"
                  />
                </AuthField>

                <button type="submit" class={AUTH_BUTTON}>
                  Register with Passkey
                </button>
              </form>
            </div>
          )}
        </auth-register>

        <p class="px-8 mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" class="underline underline-offset-4 hover:text-primary font-medium">
            Sign In
          </a>
        </p>
      </div>
    </div>
  );
};
