import { Hono } from "hono";
import { setCookie } from "hono/cookie";

import type { AppEnv } from "@server/types";
import {
  ACCESS_COOKIE,
  gateMode,
  gatedPrefixes,
  openLink,
} from "@server/services/access-gate.service";
import { EnterPage, GonePage } from "@views/pages/Gone";

/**
 * The two public ends of the access gate: the invitation link itself, and
 * the page everyone without one is sent to. Both stay reachable through the
 * gate; see OPEN_PATHS in access-gate.middleware.ts.
 */
export const accessRoute = new Hono<AppEnv>();

// GET only shows a button: link previews and crawlers GET, and must not open the link.
accessRoute.get("/a/:token", (c) => {
  const mode = gateMode(c.env);
  if (mode === "off") return c.redirect("/");
  return c.render(<EnterPage token={c.req.param("token")} mode={mode} />, {
    title: "You're invited",
    noindex: true,
    bare: true,
  });
});

accessRoute.post("/a/:token", async (c) => {
  const mode = gateMode(c.env);
  if (mode === "off") return c.redirect("/");

  const opened = await openLink(c.var.db, c.req.param("token"), mode);
  if (!opened) return c.redirect("/gone");

  const remaining = Math.floor((Date.parse(opened.link.expiresAt!) - Date.now()) / 1000);
  if (remaining <= 0) return c.redirect("/gone");

  setCookie(c, ACCESS_COOKIE, opened.cookie, {
    httpOnly: true,
    secure: c.req.url.startsWith("https://") || c.req.header("x-forwarded-proto") === "https",
    sameSite: "Lax",
    path: "/",
    maxAge: remaining,
  });
  // Into whatever the link is for: the site, or the first guarded section.
  return c.redirect(gatedPrefixes(c.env)[0]);
});

accessRoute.get("/gone", (c) =>
  c.render(<GonePage />, {
    title: "Nothing to see here",
    description: "This site is not open to the public yet.",
    noindex: true,
    bare: true,
  }),
);
