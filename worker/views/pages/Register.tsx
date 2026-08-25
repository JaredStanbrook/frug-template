import type { FC } from "hono/jsx";

export interface RegisterProps {
  methods: string[];
  roles: readonly string[];
  defaultRole: string;
  csrfToken?: string;
}

export const Register: FC<RegisterProps> = (props) => {
  const { methods, roles, defaultRole, csrfToken } = props;

  const hasPassword = methods.includes("password");
  const hasPin = methods.includes("pin");
  const hasPasskey = methods.includes("passkey");
  const showRoleSelector = roles.length > 1;
  const multipleAuthMethods = methods.length > 1;

  // Determine default tab
  const defaultTab = hasPassword ? "password" : hasPin ? "pin" : "passkey";

  return (
    <div class="max-w-7xl px-4 mx-auto pt-14">
      <div class="container grow flex flex-col items-center justify-center py-12">
        <auth-register
          class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px] p-8 border rounded-lg shadow-xl bg-card text-card-foreground"
          default-tab={defaultTab}
          csrf-token={csrfToken || ""}
          hx-disable="true"
        >
          <div class="flex flex-col space-y-2 text-center">
            <h1 class="text-3xl font-bold tracking-tight">Create Account</h1>
            <p class="text-sm text-muted-foreground">Get started with our platform</p>
          </div>

          {/* Error display container */}
          <div
            id="register-error"
            class="hidden bg-destructive/15 text-destructive px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>
            <span id="register-error-msg"></span>
          </div>

          {/* Tab triggers */}
          {multipleAuthMethods && (
            <div
              class="grid w-full grid-cols-${methods.length} bg-muted p-1 rounded-lg"
              slot="tabs"
            >
              {hasPassword && (
                <button
                  type="button"
                  data-tab="password"
                  class="tab-btn inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Password
                </button>
              )}
              {hasPin && (
                <button
                  type="button"
                  data-tab="pin"
                  class="tab-btn inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  PIN
                </button>
              )}
              {hasPasskey && (
                <button
                  type="button"
                  data-tab="passkey"
                  class="tab-btn inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Passkey
                </button>
              )}
            </div>
          )}

          {/* Shared role selector */}
          {showRoleSelector && (
            <div class="space-y-2">
              <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                I want to join as a...
              </label>
              <select
                name="role"
                form="register-form"
                class="flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {roles.map((role) => (
                  <option value={role} selected={role === defaultRole} class="capitalize">
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!showRoleSelector && (
            <input type="hidden" name="role" value={defaultRole} form="register-form" />
          )}

          {/* Password tab content */}
          {hasPassword && (
            <div data-content="password" class="space-y-4">
              <form id="register-form" class="grid gap-4">
                {csrfToken && <input type="hidden" name="_csrf" value={csrfToken} />}

                <div class="grid gap-2">
                  <label class="text-sm font-medium leading-none" for="email">
                    Email Address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="you@example.com"
                  />
                </div>

                <div class="grid gap-2">
                  <label class="text-sm font-medium leading-none" for="password">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minlength={8}
                    class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="••••••••"
                  />
                </div>

                <div class="grid gap-2">
                  <label class="text-sm font-medium leading-none" for="confirmPassword">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    minlength={8}
                    class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  class="inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
                >
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

                <div class="grid gap-2">
                  <label class="text-sm font-medium leading-none" for="pin-email">
                    Email Address
                  </label>
                  <input
                    id="pin-email"
                    name="email"
                    type="email"
                    required
                    class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="you@example.com"
                  />
                </div>

                <div class="grid gap-2">
                  <label class="text-sm font-medium leading-none" for="pin">
                    PIN (4-6 digits)
                  </label>
                  <input
                    id="pin"
                    name="pin"
                    type="password"
                    required
                    inputmode="numeric"
                    pattern="\d{4,6}"
                    maxlength={6}
                    class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="••••"
                  />
                </div>

                <div class="grid gap-2">
                  <label class="text-sm font-medium leading-none" for="confirmPin">
                    Confirm PIN
                  </label>
                  <input
                    id="confirmPin"
                    name="confirmPin"
                    type="password"
                    required
                    inputmode="numeric"
                    pattern="\d{4,6}"
                    maxlength={6}
                    class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="••••"
                  />
                </div>

                <button
                  type="submit"
                  class="inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
                >
                  Create Account
                </button>
              </form>
            </div>
          )}

          {/* Passkey tab content */}
          {hasPasskey && (
            <div data-content="passkey" class="space-y-4 hidden">
              <div class="bg-muted p-4 rounded-lg text-sm text-muted-foreground mb-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="inline mr-2"
                >
                  <circle cx="7.5" cy="15.5" r="5.5" />
                  <path d="m21 2-9.6 9.6" />
                  <path d="m15.5 7.5 3 3L22 7l-3-3" />
                </svg>
                Passkeys verify your identity using your fingerprint, face, or device PIN.
              </div>

              <form id="passkey-form" class="grid gap-4">
                {csrfToken && <input type="hidden" name="_csrf" value={csrfToken} />}

                <div class="grid gap-2">
                  <label class="text-sm font-medium leading-none" for="pk-email">
                    Email Address
                  </label>
                  <input
                    id="pk-email"
                    name="email"
                    type="email"
                    required
                    class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="you@example.com"
                  />
                </div>

                <div class="grid gap-2">
                  <label class="text-sm font-medium leading-none" for="pk-name">
                    Display Name
                  </label>
                  <input
                    id="pk-name"
                    name="name"
                    type="text"
                    required
                    class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Your Name"
                  />
                </div>

                <button
                  type="submit"
                  class="inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
                >
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
