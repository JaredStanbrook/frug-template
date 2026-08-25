import type { FC } from "hono/jsx";
import type { SafeUser } from "../../schema/auth.schema";
import { type AuthConfig } from "@server/config/auth.config";
import { StatusBadge } from "../lib/utils";

const styles: Record<string, string> = {
  verified: "bg-emerald-100 text-emerald-800 border-emerald-200",
  unverified: "bg-amber-100 text-amber-800 border-amber-200",
  admin: "bg-purple-100 text-purple-800 border-purple-200",
  user: "bg-blue-100 text-blue-800 border-blue-200",
  // Add a swatch per role in ROLES_AVAILABLE; unlisted roles fall back below.
  default: "bg-muted text-muted-foreground border-border",
};
export interface ProfileProps {
  user: SafeUser;
  config: AuthConfig;
}

export const ProfilePage: FC<ProfileProps> = (props) => {
  const methods = Array.from(props.config?.methods || []);
  // Helper for dates
  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div class="max-w-7xl mx-auto space-y-8 p-8 pt-20 animate-in fade-in duration-500">
      <div class="space-y-4 animate-in fade-in duration-300">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-3xl font-bold tracking-tight">Profile Settings</h2>
            <p class="text-muted-foreground">Manage your account settings and preferences.</p>
          </div>
        </div>

        {/* 1. PERSONAL INFORMATION */}
        <div class="rounded-2xl border bg-gradient-to-b from-card to-card/70 text-card-foreground p-6 shadow-sm md:p-8">
          <div class="flex flex-col space-y-1.5 p-6">
            <div class="flex items-center gap-2">
              <i data-lucide="user" class="h-5 w-5 text-primary"></i>
              <h3 class="font-semibold leading-none tracking-tight">Personal Information</h3>
            </div>
            <p class="text-sm text-muted-foreground">Basic identification details.</p>
          </div>

          <div class="p-6 pt-0 grid gap-6 md:grid-cols-2">
            <div class="space-y-1">
              <label class="text-muted-foreground text-xs uppercase font-medium">User ID</label>
              <div class="font-mono text-sm bg-muted p-2 rounded truncate select-all">
                {props.user.id}
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-muted-foreground text-xs uppercase font-medium">
                Email Address
              </label>
              <div class="flex items-center gap-2">
                <span>{props.user.email}</span>
                {props.user.emailVerified
                  ? StatusBadge("verified", styles, "badge-check")
                  : StatusBadge("unverified", styles, "badge-x")}
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-muted-foreground text-xs uppercase font-medium">
                Display Name
              </label>
              <div class="rounded-xl border bg-background/60 p-3">
                <profile-editable-name value={props.user.displayName || ""}></profile-editable-name>
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-muted-foreground text-xs uppercase font-medium">
                Account Roles
              </label>
              <div class="flex flex-wrap gap-2 mt-1">
                {(Array.isArray(props.user.roles) ? props.user.roles : [props.user.roles]).map(
                  (role: string) => (
                    <div>{StatusBadge(role, styles)}</div>
                  ),
                )}
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-muted-foreground text-xs uppercase font-medium">Joined</label>
              <div>{formatDate(props.user.createdAt)}</div>
            </div>

            <div class="space-y-1">
              <label class="text-muted-foreground text-xs uppercase font-medium">Last Login</label>
              <div>{props.user.lastLoginAt ? formatDate(props.user.lastLoginAt) : "Never"}</div>
            </div>
          </div>
        </div>

        {/* 2. SECURITY SETTINGS */}
        <div class="rounded-2xl border bg-gradient-to-b from-card to-card/70 text-card-foreground p-6 shadow-sm md:p-8">
          <div class="flex flex-col space-y-1.5 p-6">
            <div class="flex items-center gap-2">
              <svg
                class="h-5 w-5 text-primary"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <h3 class="font-semibold leading-none tracking-tight">Security</h3>
            </div>
            <p class="text-sm text-muted-foreground">
              Manage your password and authentication methods.
            </p>
          </div>

          <div class="p-6 pt-0 space-y-4">
            {/* TOTP Section (Example of static conditional rendering) */}
            {methods.includes("totp") && (
              <div class="flex items-center justify-between p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                <div class="flex items-center gap-4">
                  <div
                    class={`p-2.5 rounded-full ${
                      props.user.totpEnabled ? "bg-primary/10" : "bg-muted"
                    }`}
                  >
                    {props.user.totpEnabled ? (
                      <svg
                        class="h-5 w-5 text-primary"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    ) : (
                      <svg
                        class="h-5 w-5 text-muted-foreground"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
                        <path d="M12 18h.01" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <h4 class="font-medium text-sm">Authenticator App</h4>
                      {props.user.totpEnabled && (
                        <span class="inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold transition-colors border-transparent bg-primary/10 text-primary">
                          Enabled
                        </span>
                      )}
                    </div>
                    <p class="text-sm text-muted-foreground mt-0.5">
                      Use an app like Google Authenticator or Authy to generate verification codes.
                    </p>
                  </div>
                </div>
                <div>
                  <totp-setup-button
                    enabled={props.user.totpEnabled ? true : undefined}
                  ></totp-setup-button>
                </div>
              </div>
            )}
            {/*<profile-totp-card>isEnabled={props.user.totpEnabled ? true : undefined}></profile-totp-card>*/}
            {/* Change Password */}
            {methods.includes("password") && (
              <div class="flex items-center justify-between p-4 border rounded-lg">
                <div class="flex items-center gap-4">
                  <div class="p-2 bg-muted rounded-full">
                    <svg
                      class="h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
                      <circle cx="16.5" cy="7.5" r=".5" />
                    </svg>
                  </div>
                  <div>
                    <h4 class="font-medium">Password</h4>
                    <p class="text-sm text-muted-foreground">Update your account password</p>
                  </div>
                </div>
                {/* Interactive Lit Component */}
                <profile-password-modal></profile-password-modal>
              </div>
            )}
          </div>
        </div>

        {/* 3. DANGER ZONE */}
        <div class="rounded-2xl border border-destructive/50 bg-destructive/5 text-card-foreground p-6 shadow-sm md:p-8">
          <div class="flex flex-col space-y-1.5 p-6">
            <div class="flex items-center gap-2 text-destructive">
              <svg
                class="h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              <h3 class="font-semibold leading-none tracking-tight">Danger Zone</h3>
            </div>
            <p class="text-sm text-muted-foreground">
              Irreversible actions regarding your account.
            </p>
          </div>

          <div class="p-6 pt-0">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="font-medium">Delete Account</h4>
                <p class="text-sm text-muted-foreground">
                  Permanently remove your account and all data.
                </p>
              </div>
              {/* Interactive Lit Component */}
              <profile-delete-modal></profile-delete-modal>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
