import type { FC } from "hono/jsx";

import type { GateMode } from "@server/services/access-gate.service";

const BUTTON_CLASS =
  "mt-8 inline-flex h-11 cursor-pointer items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90";

/**
 * Where the access gate sends anyone without a live invitation link. Says
 * nothing about the site on purpose.
 */
export const GonePage: FC = () => (
  <div class="mx-auto max-w-xl px-4 py-24 text-center">
    <h1 class="text-3xl font-bold tracking-tight">Nothing to see here</h1>
    <p class="mt-4 text-muted-foreground text-pretty">
      This site isn't open to the public yet. If someone sent you a link, it may have expired — ask
      them for a new one.
    </p>
  </div>
);

/**
 * Shown for a GET on an invitation link. Opening the link takes a POST from
 * this button, so a chat app's link preview, which only GETs, can neither
 * spend a single-use link nor start a link's clock early.
 */
export const EnterPage: FC<{ token: string; mode: GateMode }> = ({ token, mode }) => (
  <div class="mx-auto max-w-xl px-4 py-24 text-center">
    <h1 class="text-3xl font-bold tracking-tight">You're invited</h1>
    <p class="mt-4 text-muted-foreground text-pretty">
      {mode === "session"
        ? "This link works once and then belongs to this browser. Continue to open the site."
        : "This link opens the site until it expires. Continue to go in."}
    </p>
    <form method="post" action={`/a/${encodeURIComponent(token)}`}>
      <button type="submit" class={BUTTON_CLASS}>
        Continue
      </button>
    </form>
  </div>
);
