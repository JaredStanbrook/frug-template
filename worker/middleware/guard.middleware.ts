// worker/middleware/guard.middleware.ts
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types"; // Import your Hono Env types
import { flashToast, htmxRedirect } from "@server/lib/htmx-helpers";

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.var.auth.user;

  if (!user) {
    // 1. If it's an HTMX request, we might want to trigger a client-side redirect
    if (c.req.header("HX-Request")) {
      flashToast(c, "Please sign in to continue", { type: "warning" });
      htmxRedirect(c, "/login");
      return c.text("Redirecting...", 401);
    }

    // 2. Standard browser request -> Redirect to login
    flashToast(c, "Please sign in to continue", { type: "warning" });
    return c.redirect("/login");
  }

  await next();
});
/**
 * Ensures the user is logged in and holds at least one of the required roles.
 * Usage: .use(requireRole("admin", "editor"))
 */
export const requireRole = (...allowedRoles: string[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.auth.user;
    // 1. Authentication Check
    if (!user) {
      if (c.req.header("HX-Request")) {
        flashToast(c, "Please sign in to continue", { type: "warning" });
        htmxRedirect(c, "/login");
        return c.text("Redirecting...", 401);
      }
      flashToast(c, "Please sign in to continue", { type: "warning" });
      return c.redirect("/login");
    }

    // 2. Authorization Check (Role)
    // We check if the user has ANY of the allowed roles
    const hasRole = user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      // It is good security practice to log this unauthorized attempt
      console.warn(
        `User ${user.id} attempted to access protected route. Required: ${allowedRoles}, Actual: ${user.roles}`,
      );
      if (c.req.header("HX-Request")) {
        flashToast(c, "You do not have permission to access this page", {
          type: "error",
        });
        htmxRedirect(c, "/login");
        return c.text("Redirecting...", 403);
      }
      flashToast(c, "You do not have permission to access this page", {
        type: "error",
      });
      return c.redirect("/login");
    }

    await next();
  });

/**
 * Ensures the user is logged in and holds a specific permission.
 * This is often better than checking roles directly.
 * Usage: .use(requirePermission("users.delete"))
 */
export const requirePermission = (requiredPermission: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.auth.user;

    // 1. Authentication Check
    if (!user) {
      if (c.req.header("HX-Request")) {
        flashToast(c, "Please sign in to continue", { type: "warning" });
        htmxRedirect(c, "/login");
        return c.text("Redirecting...", 401);
      }
      flashToast(c, "Please sign in to continue", { type: "warning" });
      return c.redirect("/login");
    }

    // 2. Authorization Check (Permission)
    // Your SafeUser object already has the flat array of permissions calculated
    if (!user.permissions.includes(requiredPermission)) {
      if (c.req.header("HX-Request")) {
        flashToast(c, "You do not have permission to access this page", {
          type: "error",
        });
        htmxRedirect(c, "/login");
        return c.text("Redirecting...", 403);
      }
      flashToast(c, "You do not have permission to access this page", {
        type: "error",
      });
      return c.redirect("/login");
    }

    await next();
  });
