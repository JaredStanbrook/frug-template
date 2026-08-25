import { createMiddleware } from "hono/factory";
import { drizzle } from "drizzle-orm/d1";
import type { AppEnv } from "../types";

export const dbMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const db = drizzle(c.env.DB);
  c.set("db", db);
  await next();
});
