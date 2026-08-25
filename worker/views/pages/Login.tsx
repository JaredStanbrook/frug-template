import type { FC } from "hono/jsx";

export interface LoginProps {
  methods: string[];
  csrfToken?: string;
}

export const Login: FC<LoginProps> = (props) => {
  const { methods, csrfToken } = props;

  const hasPassword = methods.includes("password");
  const hasPin = methods.includes("pin");
  const hasPasskey = methods.includes("passkey");
  const multipleAuthMethods = methods.length > 1;

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
          <div class="flex flex-col space-y-2 text-center">
            <h1 class="text-3xl font-bold tracking-tight">Welcome Back</h1>
            <p class="text-sm text-muted-foreground">Sign in to your account</p>
          </div>

          {/* Error display container */}
          <div
            id="login-error"
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
            <span id="login-error-msg"></span>
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

          {/* Password tab content */}
          {hasPassword && (
            <div data-content="password" class="space-y-4">
              <form id="login-form" class="grid gap-4">
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
                  <div class="flex items-center justify-between">
                    <label class="text-sm font-medium leading-none" for="password">
                      Password
                    </label>
                    <a
                      href="/forgot-password"
                      class="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="••••••••"
                  />
                </div>

                <button class="inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full">
                  Sign In
                </button>
              </form>
            </div>
          )}

          {/* PIN tab content */}
          {hasPin && (
            <div data-content="pin" class="space-y-4 hidden">
              <form id="pin-login-form" class="grid gap-4">
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
                    PIN
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

                <button
                  type="submit"
                  class="inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
                >
                  Sign In
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
                Use your passkey to sign in securely.
              </div>

              <form id="passkey-login-form" class="grid gap-4">
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

                <button
                  type="submit"
                  class="inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
                >
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
