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

/**
 * The hero's one memorable thing: a planet, two tilted orbits and a satellite
 * slowly circling the outer one. Colours are theme tokens; the motion is
 * `motion-safe` so a reduced-motion setting leaves it still.
 */
const OrbitScene = () => (
  <svg viewBox="0 0 320 320" class="w-full max-w-sm text-foreground" aria-hidden="true">
    <circle cx="160" cy="160" r="150" class="fill-secondary" />
    <circle cx="160" cy="160" r="150" fill="none" stroke="currentColor" stroke-width="2" />
    <g transform="rotate(-24 160 160)">
      <ellipse
        cx="160"
        cy="160"
        rx="140"
        ry="44"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-dasharray="2 8"
        stroke-linecap="round"
      />
      <ellipse
        cx="160"
        cy="160"
        rx="104"
        ry="30"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
    </g>
    <circle cx="160" cy="160" r="58" class="fill-primary" />
    <path d="M110 136 a58 58 0 0 1 100 0 z" class="fill-chart-3" />
    <path d="M102 160 h116" stroke="currentColor" stroke-width="2" opacity="0.35" />
    <path d="M110 184 h100" stroke="currentColor" stroke-width="2" opacity="0.35" />
    <circle cx="160" cy="160" r="58" fill="none" stroke="currentColor" stroke-width="2" />
    <g class="motion-safe:animate-[spin_24s_linear_infinite] origin-center">
      <circle cx="160" cy="18" r="9" class="fill-chart-2" stroke="currentColor" stroke-width="2" />
    </g>
  </svg>
);

export const Home = ({ app, user }: HomeProps) => {
  return (
    <div class="max-w-5xl px-4 mx-auto pt-16 md:pt-24 pb-8">
      <section class="grid items-center gap-10 md:grid-cols-[1.25fr_1fr]">
        <div class="space-y-6">
          <span class="inline-flex items-center gap-2 rounded-full border border-input bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <i data-lucide="sparkles" class="h-3 w-3 text-primary"></i>
            Cloudflare Workers template
          </span>
          <h1 class="text-4xl md:text-6xl leading-[1.1] text-balance break-words">{app.name}</h1>
          {app.tagline ? (
            <p class="text-lg text-muted-foreground max-w-xl text-pretty">{app.tagline}</p>
          ) : null}

          <div class="flex flex-wrap items-center gap-3 pt-2">
            {user ? (
              <>
                <a
                  href="/notes"
                  class="inline-flex items-center justify-center rounded-full bg-primary px-6 h-12 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
                >
                  Open Notes
                </a>
                <a
                  href="/profile"
                  class="inline-flex items-center justify-center rounded-full border-2 border-foreground px-6 h-12 text-sm font-semibold hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Your profile
                </a>
              </>
            ) : (
              <>
                <a
                  href="/register"
                  class="inline-flex items-center justify-center rounded-full bg-primary px-6 h-12 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
                >
                  Create an account
                </a>
                <a
                  href="/login"
                  class="inline-flex items-center justify-center rounded-full border-2 border-foreground px-6 h-12 text-sm font-semibold hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Sign in
                </a>
              </>
            )}
          </div>
        </div>

        <div class="hidden sm:flex justify-center md:justify-end">
          <OrbitScene />
        </div>
      </section>

      {/* One instrument panel, not four floating cards: the features are
          parts of the same console, so they share its frame. */}
      <section class="mt-16 md:mt-24 rounded-2xl border-2 border-foreground bg-card shadow-md overflow-hidden">
        <div class="grid sm:grid-cols-2 divide-y-2 sm:divide-y-0 divide-border">
          {features.map((feature, i) => (
            <div
              class={`p-6 space-y-3 ${i < 2 ? "sm:border-b-2" : ""} ${i % 2 === 0 ? "sm:border-r-2" : ""}`}
            >
              <div class="flex h-11 w-11 items-center justify-center rounded-full border-2 border-foreground bg-secondary text-secondary-foreground">
                <i data-lucide={feature.icon} class="h-5 w-5"></i>
              </div>
              <h2 class="text-lg font-semibold">{feature.title}</h2>
              <p class="text-sm text-muted-foreground leading-relaxed">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section class="mt-10">
        <div class="rounded-2xl border border-dashed border-input bg-muted/50 p-6 space-y-3">
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
