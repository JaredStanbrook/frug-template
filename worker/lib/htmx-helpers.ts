import { Context } from "hono";
import type { HtmlEscapedString } from "hono/utils/html";
import { setCookie } from "hono/cookie";

type Renderable = string | HtmlEscapedString | Promise<HtmlEscapedString>;
/**
 * Check if the request is an HTMX request
 */
export const isHtmxRequest = (c: Context): boolean => {
  return c.req.header("HX-Request") === "true";
};

/**
 * Return HTML fragment for HTMX or full page for regular requests
 */
export const htmxResponse = async (
  c: Context,
  title: string,
  fragment: Renderable,
  fullPage?: Renderable,
) => {
  if (c.req.header("HX-Request")) {
    return c.html(fragment);
  }

  if (fullPage) {
    return c.html(fullPage);
  }
  return c.render(fragment, { title });
};

/**
 * Trigger HTMX client-side events
 */
export const htmxTrigger = (c: Context, events: string | Record<string, any>) => {
  const triggerValue = typeof events === "string" ? events : JSON.stringify(events);
  c.header("HX-Trigger", triggerValue);
};

/**
 * Push a new URL to browser history
 */
export const htmxPushUrl = (c: Context, url: string) => {
  c.header("HX-Push-Url", url);
};

/**
 * Redirect with HTMX
 */
export const htmxRedirect = (c: Context, url: string) => {
  c.header("HX-Redirect", url);
  return c.body(null, 200);
};

/**
 * Send toast notification via HTMX event that triggers the Lit toast component
 */
export const htmxToast = (
  c: Context,
  message: string,
  options?: {
    description?: string;
    type?: "success" | "error" | "info" | "warning";
    duration?: number;
  },
) => {
  const { description, type = "success", duration = 4000 } = options || {};

  htmxTrigger(c, {
    toast: {
      message,
      description,
      type,
      duration,
    },
  });
};

export const flashToast = (
  c: Context,
  message: string,
  options?: {
    description?: string;
    type?: "success" | "error" | "info" | "warning";
    duration?: number;
  },
) => {
  const { description, type = "success", duration = 4000 } = options || {};
  setCookie(
    c,
    "flash-toast",
    JSON.stringify({
      toast: {
        message,
        description,
        type,
        duration,
      },
    }),
    {
      httpOnly: false,
      path: "/",
      maxAge: 5,
    },
  );
};

/**
 * These helpers are meant to be used together. `worker/routes/notes.tsx` is a
 * complete worked example, but the shape is:
 *
 *   // List: fragment for HTMX, full page for a direct visit or hx-boost.
 *   app.get("/things", async (c) => {
 *     const things = await c.var.db.select().from(thing);
 *     return htmxResponse(c, "Things", <ThingTable things={things} />);
 *   });
 *
 *   // Mutate: toast on the response, then redirect or swap a fragment.
 *   app.post("/things", zValidator("form", thingFormSchema), async (c) => {
 *     await c.var.db.insert(thing).values(c.req.valid("form"));
 *     flashToast(c, "Thing created");   // survives a redirect
 *     return c.redirect("/things");
 *   });
 *
 *   // Delete: empty body replaces the row the request targeted.
 *   app.delete("/things/:id", async (c) => {
 *     await c.var.db.delete(thing).where(eq(thing.id, Number(c.req.param("id"))));
 *     htmxToast(c, "Thing deleted");    // same-response toast
 *     return c.body(null, 200);
 *   });
 *
 * Use `htmxToast` when the response itself renders; use `flashToast` when you
 * are redirecting, since the message has to survive the next navigation.
 */
