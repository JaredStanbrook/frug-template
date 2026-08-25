// worker/services/roles.service.ts
import { eq, and, or, isNull, gt } from "drizzle-orm";
import { userRoles, userPermissions } from "../schema/roles.schema";
import { type AuthConfig } from "../config/auth.config";
import { type Variables } from "../types";
export class RoleService {
  private db: Variables["db"];
  private config: AuthConfig;

  constructor(db: Variables["db"], config: AuthConfig) {
    this.db = db;
    this.config = config;
  }

  /**
   * Assigns a role to a user.
   */
  async assignRole(userId: string, role: string, assignedBy?: string, expiresAt?: Date) {
    if (!this.config.roles.available.includes(role)) {
      throw new Error(`Role '${role}' is not defined in this system configuration.`);
    }

    // Check if user already has this role (active)
    const existing = await this.db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.role, role as any), // Type assertion due to dynamic config
        ),
      )
      .get();

    if (existing) {
      // Update expiration if exists
      await this.db
        .update(userRoles)
        .set({ expiresAt: expiresAt || null })
        .where(eq(userRoles.id, existing.id));
    } else {
      await this.db.insert(userRoles).values({
        userId,
        role: role as any,
        assignedBy,
        expiresAt,
      });
    }
  }

  /**
   * Calculates ALL active permissions for a user.
   * Merges Role-based permissions AND direct user permissions.
   * Respects expiration dates.
   */
  async getUserPermissions(userId: string): Promise<Set<string>> {
    const now = new Date();

    // 1. Get User's Roles from DB
    const activeRoles = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now)),
        ),
      )
      .all();

    const permissions = new Set<string>();

    // 2. Load Inherent Permissions from Config
    // A role granted "*" (e.g. ROLES_INHERENT="admin:*") expands to every
    // permission in PERMISSIONS_AVAILABLE, so `hasPermission("notes.delete")`
    // answers true rather than looking for a literal "*" grant.
    for (const r of activeRoles) {
      const roleName = r.role as string;
      const rolePerms = this.config.roles.inherent[roleName] || [];

      if (rolePerms.includes("*")) {
        this.config.permissions.available.forEach((p) => permissions.add(p));
        continue;
      }

      rolePerms.forEach((p) => permissions.add(p));
    }

    // 3. Load Direct User Permissions from DB (Optional overrides)
    const directPerms = await this.db
      .select({ permission: userPermissions.permission })
      .from(userPermissions)
      .where(
        and(
          eq(userPermissions.userId, userId),
          or(isNull(userPermissions.expiresAt), gt(userPermissions.expiresAt, now)),
        ),
      )
      .all();

    directPerms.forEach((r: any) => permissions.add(r.permission));

    return permissions;
  }

  /**
   * Fast check if a user has a specific permission
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const perms = await this.getUserPermissions(userId);
    return perms.has(permission);
  }

  /**
   * Get formatted user roles for the frontend
   */
  async getUserRoles(userId: string): Promise<string[]> {
    const now = new Date();
    const roles = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now)),
        ),
      )
      .all();
    return roles.map((r: any) => r.role);
  }
}
