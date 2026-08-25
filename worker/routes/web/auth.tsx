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
    title: "Home",
  });
});

webAuth.get("/register", (c) => {
  const { auth, authConfig } = c.var;
  if (auth.user) return c.redirect("/");

  const props = {
    methods: Array.from(authConfig.methods),
    roles: authConfig.roles?.available || ["user"],
    defaultRole: authConfig.roles?.default || "user",
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
  auth.destroySession();

  flashToast(c, "Logged out successfully", {
    type: "success",
  });
  htmxRedirect(c, "/login");
  return c.body(null);
});
