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
    return (await this.getRolesAndPermissions(userId)).permissions;
  }

  /**
   * Get formatted user roles for the frontend
   */
  async getUserRoles(userId: string): Promise<string[]> {
    return (await this.getRolesAndPermissions(userId)).roles;
  }

  /**
   * Resolve a user's active roles and effective permissions in one go.
   *
   * Both answers derive from the same two tables, so fetching them separately
   * meant reading `user_roles` twice and doing it sequentially — four D1 round
   * trips on the auth path of every authenticated request, when the work needs
   * two queries issued concurrently. On remote D1 each round trip is a network
   * hop, so this is the difference between roughly 4x and 1x that latency on
   * every page load.
   *
   * Callers that want only one half still go through here; it is a single
   * query pair either way.
   */
  async getRolesAndPermissions(userId: string): Promise<{
    roles: string[];
    permissions: Set<string>;
  }> {
    const now = new Date();

    const [activeRoles, directPerms] = await Promise.all([
      this.db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, userId),
            or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now)),
          ),
        )
        .all(),
      this.db
        .select({ permission: userPermissions.permission })
        .from(userPermissions)
        .where(
          and(
            eq(userPermissions.userId, userId),
            or(isNull(userPermissions.expiresAt), gt(userPermissions.expiresAt, now)),
          ),
        )
        .all(),
    ]);

    const roles = activeRoles.map((r: any) => r.role as string);
    const permissions = new Set<string>();

    // Inherent permissions from config. A role granted "*" (e.g.
    // ROLES_INHERENT="admin:*") expands to every permission in
    // PERMISSIONS_AVAILABLE, so `hasPermission("notes.delete")` answers true
    // rather than looking for a literal "*" grant.
    for (const roleName of roles) {
      const rolePerms = this.config.roles.inherent[roleName] || [];

      if (rolePerms.includes("*")) {
        this.config.permissions.available.forEach((p) => permissions.add(p));
        continue;
      }

      rolePerms.forEach((p) => permissions.add(p));
    }

    // Direct per-user grants, layered on top.
    directPerms.forEach((r: any) => permissions.add(r.permission));

    return { roles, permissions };
  }

  /**
   * Fast check if a user has a specific permission
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const perms = await this.getUserPermissions(userId);
    return perms.has(permission);
  }
}
