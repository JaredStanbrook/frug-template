// worker/routes/web/auth.ts
import { Hono } from "hono";

import { Home } from "@server/views/pages/Home";
import { Login } from "@server/views/pages/Login";
import { Register } from "@server/views/pages/Register";
import type { AppEnv } from "../../types";
import { flashToast, htmxRedirect } from "@server/lib/htmx-helpers";

export const webAuth = new Hono<AppEnv>();

webAuth.get("/", (c) => {
  const { auth, app } = c.var;

  return c.render(<Home app={app} user={auth.user} />, {
    // The home page is the site's own entry in search results, so it gets the
    // tagline as its description and no "Home ·" prefix on the title.
    title: undefined,
    description: app.tagline,
    type: "website",
  });
});

webAuth.get("/register", (c) => {
  const { auth, authConfig } = c.var;
  if (auth.user) return c.redirect("/");

  const props = {
    methods: Array.from(authConfig.methods),
    roles: authConfig.roles?.available || ["user"],
    defaultRole: authConfig.roles?.default || "user",
    // The form should state the rule it will be judged by. Without this the
    // page advertised a minimum of 8 while the server enforced whatever
    // PASSWORD_MIN_LENGTH said, so the only way to learn the real rule was to
    // be rejected by it.
    passwordPolicy: authConfig.password,
  };
  return c.render(<Register {...props} />, {
    title: "Create Account",
  });
});

webAuth.get("/login", (c) => {
  const { auth, authConfig } = c.var;
  if (auth.user) return c.redirect("/");

  const props = {
    methods: Array.from(authConfig.methods),
  };
  return c.render(<Login {...props} />, {
    title: "Sign In",
  });
});
webAuth.post("/web/auth/logout", async (c) => {
  // 1. Clear Cookies/Session
  const { auth } = c.var;
  // Awaited: this revokes the session row, and an un-awaited promise can be
  // dropped when the response goes out — leaving a "logged out" user whose
  // token still works.
  await auth.destroySession();

  flashToast(c, "Logged out successfully", {
    type: "success",
  });
  htmxRedirect(c, "/login");
  return c.body(null);
});
