import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "./types";

import routes from "./app";

import { configMiddleware } from "./middleware/config.middleware";
import { dbMiddleware } from "./middleware/db.middleware";
import { authMiddleware } from "./middleware/auth.middleware";
import { describeError, isMissingSchema } from "./lib/errors";

const worker = new Hono<AppEnv>();

// ---------------------------------------------------------
// GLOBAL MIDDLEWARE
// ---------------------------------------------------------
worker.use("*", logger());

worker.use("*", (c, next) =>
  cors({
    // Same-origin by default: only the configured ORIGIN and localhost are
    // allowed. Widen this deliberately if you add a separate frontend.
    origin: (origin) => {
      if (!origin) return c.env.ORIGIN;
      if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
        return origin;
      }
      return origin === c.env.ORIGIN ? origin : c.env.ORIGIN;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    exposeHeaders: ["HX-Trigger", "HX-Redirect", "HX-Push-Url", "HX-Refresh"],
    credentials: true,
  })(c, next),
);

// Applied globally so SSR pages get the same context as API routes.
worker.use("*", configMiddleware);
worker.use("*", dbMiddleware);
worker.use("*", authMiddleware);

// ---------------------------------------------------------
// APPLICATION ROUTES
// ---------------------------------------------------------
worker.route("/", routes);

// ---------------------------------------------------------
// ERRORS & STATIC ASSETS
// ---------------------------------------------------------
worker.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  // Flatten the cause chain: a Drizzle failure carries the useful part
  // ("no such table: users") on `.cause`, and `console.error(err)` alone
  // prints the wrapper without it.
  console.error(`[unhandled] ${c.req.method} ${c.req.path} — ${describeError(err)}`);

  if (isMissingSchema(err)) {
    return c.json(
      { error: "The database has not been set up yet. Apply the migrations, then try again." },
      503,
    );
  }

  return c.json({ error: "Internal Server Error" }, 500);
});

// Anything the router did not claim falls through to the client bundle
// (/static/*, favicon, and any other file in public/).
worker.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default worker;
