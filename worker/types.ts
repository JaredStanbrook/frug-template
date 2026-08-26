import { drizzle } from "drizzle-orm/d1";
import type { AppConfig } from "./config/app.config";
import type { AuthConfig } from "./config/auth.config";
import type { Auth } from "./services/auth.service";

/**
 * Plain-text `vars` and secrets from wrangler.jsonc / .dev.vars.
 *
 * Everything Cloudflare hands us is a string; parsing into typed config
 * happens once per request in `config.middleware.ts`. Add a key here when
 * you add one to wrangler.jsonc so it stays typed at the call site.
 */
export type Vars = {
  /** "production" | "staging" | whatever you name an env in wrangler.jsonc. */
  ENVIRONMENT: string;
  APP_NAME: string;
  APP_TAGLINE: string;
  APP_LOCALE: string;
  APP_CURRENCY: string;
  ORIGIN: string;
  /** A Wrangler secret, never a var. Signs the session JWT. */
  JWT_SECRET: string;
  AUTH_METHODS: string;
  ROLES_AVAILABLE: string;
  ROLES_DEFAULT: string;
  ROLES_RESTRICTED: string;
  ROLES_INHERENT: string;
  PERMISSIONS_AVAILABLE: string;
  RP_NAME: string;
  RP_ID: string;
  /**
   * First-run admin bootstrap. When set, registering with this exact email
   * grants admin — but only while no admin exists yet. See
   * `Auth.resolveBootstrapRole`.
   */
  BOOTSTRAP_ADMIN_EMAIL: string;
};

/**
 * Cloudflare's edge rate limiter, declared under `ratelimits` in
 * wrangler.jsonc. Not part of the generated Env types in every Wrangler
 * version, so it is declared here.
 */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type Bindings = Vars & {
  /** Auth challenges, session metadata, short-lived caches. */
  KV: KVNamespace;
  /** Primary database. Schema lives in worker/schema/, migrations in drizzle/. */
  DB: D1Database;
  /** Static client bundle produced by `vite build --mode client`. */
  ASSETS: Fetcher;
  /** Optional file storage. Remove here and in wrangler.jsonc if unused. */
  R2: R2Bucket;
  /** Per-IP throttle on the auth API. See worker/routes/api/auth.ts. */
  RATE_LIMITER: RateLimiter;
};

export type Variables = {
  db: ReturnType<typeof drizzle>;
  app: AppConfig;
  authConfig: AuthConfig;
  isMethodEnabled: (method: string) => boolean;
  auth: Auth;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
