import type { SafeUser } from "@server/schema/auth.schema";
import type { AppConfig } from "@server/config/app.config";

interface HomeProps {
  app: AppConfig;
  user: SafeUser | null;
}

const features = [
  {
    icon: "shield-check",
    title: "Auth already built",
    body: "Password, PIN, TOTP and passkey sign-in with lockout, session limits and an audit log. Pick which methods a site offers with one env var.",
  },
  {
    icon: "key-round",
    title: "Roles and permissions",
    body: "Roles, inherited permissions and per-user grants, all declared in wrangler.jsonc. Guard a route with requireRole or requirePermission.",
  },
  {
    icon: "database",
    title: "D1 and Drizzle",
    body: "Typed schema in worker/schema/, migrations generated into drizzle/, and Zod validators derived from the same tables.",
  },
  {
    icon: "zap",
    title: "SSR + HTMX",
    body: "Hono JSX renders on the edge, HTMX swaps fragments. Web Components only where client state is genuinely unavoidable.",
  },
];

export const Home = ({ app, user }: HomeProps) => {
  return (
    <div class="max-w-5xl px-4 mx-auto pt-24 pb-16">
      <section class="text-center space-y-6">
        <span class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          <i data-lucide="sparkles" class="h-3 w-3"></i>
          Cloudflare Workers template
        </span>
        <h1 class="text-4xl md:text-5xl font-bold tracking-tight text-balance">{app.name}</h1>
        {app.tagline ? (
          <p class="text-lg text-muted-foreground max-w-2xl mx-auto text-balance">{app.tagline}</p>
        ) : null}

        <div class="flex items-center justify-center gap-3 pt-2">
          {user ? (
            <>
              <a
                href="/notes"
                class="inline-flex items-center justify-center rounded-lg bg-primary px-5 h-11 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Open Notes
              </a>
              <a
                href="/profile"
                class="inline-flex items-center justify-center rounded-lg border border-input px-5 h-11 text-sm font-medium hover:bg-accent transition-colors"
              >
                Your profile
              </a>
            </>
          ) : (
            <>
              <a
                href="/register"
                class="inline-flex items-center justify-center rounded-lg bg-primary px-5 h-11 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Create an account
              </a>
              <a
                href="/login"
                class="inline-flex items-center justify-center rounded-lg border border-input px-5 h-11 text-sm font-medium hover:bg-accent transition-colors"
              >
                Sign in
              </a>
            </>
          )}
        </div>
      </section>

      <section class="grid gap-4 sm:grid-cols-2 pt-16">
        {features.map((feature) => (
          <div class="rounded-2xl border bg-card p-6 shadow-sm space-y-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <i data-lucide={feature.icon} class="h-5 w-5"></i>
            </div>
            <h2 class="font-semibold">{feature.title}</h2>
            <p class="text-sm text-muted-foreground leading-relaxed">{feature.body}</p>
          </div>
        ))}
      </section>

      <section class="pt-16">
        <div class="rounded-2xl border bg-muted/30 p-6 space-y-3">
          <h2 class="font-semibold">Make this your own</h2>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Replace this page in <code class="text-foreground">worker/views/pages/Home.tsx</code>,
            then follow the checklist in <code class="text-foreground">README.md</code> to point the
            worker at your own D1, KV and domain. The Notes feature is a worked example of the full
            stack — copy its shape and delete it.
          </p>
        </div>
      </section>
    </div>
  );
};
