import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";
import { parseAppConfig } from "../config/app.config";
import { parseAuthConfig, type AuthMethod } from "../config/auth.config";

export const configMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authConfig = parseAuthConfig(c.env);
  c.set("app", parseAppConfig(c.env));
  c.set("authConfig", authConfig);
  c.set("isMethodEnabled", (method: string) => authConfig.methods.has(method as AuthMethod));
  await next();
});
