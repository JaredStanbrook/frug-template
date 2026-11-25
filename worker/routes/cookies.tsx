// worker/routes/cookies.tsx
//
// GET  /cookies  the cookie policy: every category, every cookie, and the
//                same switches as the preferences dialog.
// POST /cookies  saves a choice. "accept" allows every category the site
//                offers, "reject" none, "custom" the switches that were on.
//                To HTMX it returns the consent block re-rendered (the banner
//                gone); otherwise it goes back to the page the visitor was on.

import { Hono } from "hono";

import type { AppEnv } from "../types";
import { offeredCategories, OPTIONAL_CATEGORIES } from "../config/cookies.config";
import { readConsent, writeConsent, type Consent } from "../lib/consent";
import { CookieConsent, CookiePreferencesForm } from "../views/components/CookieConsent";

export const cookiesRoute = new Hono<AppEnv>();

cookiesRoute.get("/cookies", (c) => {
  const offered = offeredCategories(c.env);
  return c.render(
    <div class="mx-auto max-w-2xl px-4 pt-8 pb-12">
      <h1 class="text-2xl font-bold tracking-tight">Cookies</h1>
      <p class="mt-2 text-muted-foreground">
        What this site stores in your browser, and why. Your choices are saved for six months.
      </p>
      <CookiePreferencesForm offered={offered} consent={readConsent(c)} />
    </div>,
    {
      title: "Cookies",
      description: "The cookies this site uses, and your choices about them.",
    },
  );
});

cookiesRoute.post("/cookies", async (c) => {
  const body = await c.req.parseBody();
  const offered = new Set(offeredCategories(c.env));
  const choice = String(body.choice ?? "custom");
  const consent = Object.fromEntries(
    OPTIONAL_CATEGORIES.map((cat) => [
      cat,
      // A category the site does not offer is never allowed, whatever is posted.
      offered.has(cat) && (choice === "accept" || (choice === "custom" && body[cat] === "on")),
    ]),
  ) as Consent;
  writeConsent(c, consent);

  if (c.req.header("HX-Request")) {
    return c.html(<CookieConsent offered={[...offered]} consent={consent} />);
  }
  // Back to the page they were on, if it was on this site.
  const back = c.req.header("Referer");
  const sameSite = back && new URL(back).origin === new URL(c.req.url).origin;
  return c.redirect(sameSite ? back : "/", 303);
});
