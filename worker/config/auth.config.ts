// config/auth.config.ts

/**
 * Centralized authentication configuration
 * All auth behavior is driven by Cloudflare Workers environment bindings
 */

export type AuthMethod = "passkey" | "password" | "pin" | "totp" | "email" | "sms";

export interface AuthConfig {
  methods: Set<AuthMethod>;
  session: {
    duration: number; // milliseconds
    renewalThreshold: number; // milliseconds before expiry to auto-renew
    maxSessions: number; // max concurrent sessions per user
  };
  security: {
    maxFailedAttempts: number;
    lockoutDuration: number; // milliseconds
    requireEmailVerification: boolean;
    requirePhoneVerification: boolean;
    allowedEmails: string[];
    jwtSecret: string;
    jwtExpiry: number;
  };
  password?: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
  };
  pin?: {
    length: number;
    numbersOnly: boolean;
  };
  totp?: {
    issuer: string;
    algorithm: "SHA1" | "SHA256" | "SHA512";
    digits: number;
    period: number;
  };
  passkey?: {
    rpName: string;
    rpId: string;
  };
  // RBAC Configuration
  roles: {
    available: readonly string[];
    default: string;
    restricted: readonly string[];
    inherent: Record<string, string[]>;
  };
  permissions: {
    available: readonly string[];
  };
}

/**
 * Parse environment variables from Cloudflare Workers env and build auth configuration
 */
export function parseAuthConfig(env: any): AuthConfig {
  // Parse AUTH_METHODS (comma-separated: "passkey,password,totp")
  const methodsEnv = env.AUTH_METHODS;
  const methods = new Set(methodsEnv.split(",").map((m: string) => m.trim()) as AuthMethod[]);
  const allowedEmailsEnv = env.ALLOWED_EMAILS || "";
  const allowedEmails = allowedEmailsEnv
    .split(",")
    .map((email: string) => email.trim())
    .filter((email: string) => email.length > 0);

  // Session configuration
  const sessionDuration = parseInt(env.SESSION_DURATION || "86400000"); // 24 hours default
  const sessionRenewalThreshold = parseInt(env.SESSION_RENEWAL_THRESHOLD || "3600000"); // 1 hour
  const maxSessions = parseInt(env.MAX_SESSIONS_PER_USER || "5");

  // Security configuration
  const maxFailedAttempts = parseInt(env.MAX_FAILED_LOGIN_ATTEMPTS || "5");
  const lockoutDuration = parseInt(env.LOCKOUT_DURATION || "900000"); // 15 minutes
  const requireEmailVerification = env.REQUIRE_EMAIL_VERIFICATION === "true";
  const requirePhoneVerification = env.REQUIRE_PHONE_VERIFICATION === "true";

  // RBAC Configuration Parsing
  // Default to a simple user/admin system if not configured
  const rolesAvailable = (env.ROLES_AVAILABLE || "admin,user")
    .split(",")
    .map((r: string) => r.trim());

  const roleDefault = env.ROLES_DEFAULT || "user";

  const rolesRestricted = (env.ROLES_RESTRICTED || "admin")
    .split(",")
    .map((r: string) => r.trim())
    .filter((r: string) => r.length > 0); // Remove empty strings if env var is empty

  const permissionsAvailable = (env.PERMISSIONS_AVAILABLE || "")
    .split(",")
    .map((p: string) => p.trim())
    .filter((p: string) => p.length > 0);
  const rolesInherentEnv = env.ROLES_INHERENT || "";
  const rolesInherent: Record<string, string[]> = {};
  if (rolesInherentEnv) {
    // Expected format: "user:blogs.read,blogs.create;editor:blogs.update.any,blogs.delete.any"
    const roleDefs = rolesInherentEnv.split(";");
    roleDefs.forEach((def: string) => {
      const [role, perms] = def.split(":");
      if (role && perms) {
        rolesInherent[role.trim()] = perms.split(",").map((p: string) => p.trim());
      }
    });
  }

  // Build final configuration object
  const config: AuthConfig = {
    methods,
    session: {
      duration: sessionDuration,
      renewalThreshold: sessionRenewalThreshold,
      maxSessions,
    },
    security: {
      maxFailedAttempts,
      lockoutDuration,
      requireEmailVerification,
      requirePhoneVerification,
      allowedEmails,
      // No fallback on purpose. A default here signs real sessions with a
      // value published in this template's source; `requireSecrets` stops the
      // app before an empty one can be used.
      jwtSecret: env.JWT_SECRET ?? "",
      jwtExpiry: parseInt(env.JWT_EXPIRY) || 7 * 24 * 60 * 60,
    },
    roles: {
      available: rolesAvailable,
      default: roleDefault,
      restricted: rolesRestricted,
      inherent: rolesInherent,
    },
    permissions: {
      available: permissionsAvailable,
    },
  };

  // Password configuration (only if enabled)
  if (methods.has("password")) {
    config.password = {
      minLength: parseInt(env.PASSWORD_MIN_LENGTH || "8"),
      requireUppercase: env.PASSWORD_REQUIRE_UPPERCASE !== "false",
      requireLowercase: env.PASSWORD_REQUIRE_LOWERCASE !== "false",
      requireNumbers: env.PASSWORD_REQUIRE_NUMBERS !== "false",
      requireSpecialChars: env.PASSWORD_REQUIRE_SPECIAL !== "false",
    };
  }

  // PIN configuration (only if enabled)
  if (methods.has("pin")) {
    config.pin = {
      length: parseInt(env.PIN_LENGTH || "6"),
      numbersOnly: env.PIN_NUMBERS_ONLY !== "false",
    };
  }

  // TOTP configuration (only if enabled)
  if (methods.has("totp")) {
    config.totp = {
      issuer: env.TOTP_ISSUER || "MyApp",
      algorithm: (env.TOTP_ALGORITHM || "SHA1") as "SHA1" | "SHA256" | "SHA512",
      digits: parseInt(env.TOTP_DIGITS || "6"),
      period: parseInt(env.TOTP_PERIOD || "30"),
    };
  }

  // passkey configuration (only if enabled)
  if (methods.has("passkey")) {
    config.passkey = {
      rpName: env.RP_NAME || "MyApp",
      rpId: env.RP_ID || "localhost",
    };
  }

  return config;
}

/**
 * Helper functions to check enabled auth methods
 */
export function isMethodEnabled(config: AuthConfig, method: AuthMethod): boolean {
  return config.methods.has(method);
}

export function getEnabledMethods(config: AuthConfig): AuthMethod[] {
  return Array.from(config.methods);
}

export function requiresAnyMethod(config: AuthConfig, ...methods: AuthMethod[]): boolean {
  return methods.some((method) => config.methods.has(method));
}

/**
 * Validate that required environment variables are set
 */
export function validateAuthConfig(env: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const config = parseAuthConfig(env);

  if (!env.JWT_SECRET) {
    errors.push("JWT_SECRET must be set as a Secret on the Worker (see docs/deploy.md).");
  }

  // Method Validation
  if (config.methods.size === 0) {
    errors.push("At least one AUTH_METHOD must be specified");
  }

  if (config.methods.has("totp") && !env.TOTP_ISSUER) {
    errors.push("TOTP_ISSUER must be set when TOTP is enabled");
  }

  if (config.methods.has("email") && !env.SMTP_HOST) {
    errors.push("SMTP configuration required when email auth is enabled");
  }

  if (config.methods.has("sms") && !env.SMS_PROVIDER_API_KEY) {
    errors.push("SMS provider configuration required when SMS auth is enabled");
  }

  // RBAC Validation
  if (!config.roles.available.includes(config.roles.default)) {
    errors.push(
      `Configured default role '${config.roles.default}' is not listed in ROLES_AVAILABLE.`,
    );
  }

  config.roles.restricted.forEach((role) => {
    if (!config.roles.available.includes(role)) {
      errors.push(`Configured restricted role '${role}' is not listed in ROLES_AVAILABLE.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
