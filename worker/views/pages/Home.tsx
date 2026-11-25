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
 * The template's home page opens on its one thing, what the template gives
 * you, under a one-line title: no hero, no blurb, no buttons in front of the
 * content. A real site replaces this with its own one thing (the brief names
 * it; see "Pages open on their content" in the frugal skill).
 */
export const Home = () => {
  return (
    <div class="max-w-5xl px-4 mx-auto pt-8 md:pt-12 pb-8">
      <h1 class="mb-6 text-2xl font-bold tracking-tight">What this template gives you</h1>

      {/* One instrument panel, not four floating cards: the features are
          parts of the same console, so they share its frame. */}
      <section class="rounded-2xl border-2 border-foreground bg-card shadow-md overflow-hidden">
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
