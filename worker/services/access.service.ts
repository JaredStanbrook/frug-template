// worker/services/access.service.ts
import { HTTPException } from "hono/http-exception";
import type { SafeUser } from "../schema/auth.schema";

/**
 * Every resource the app authorizes against. Keep this in sync with the
 * PERMISSIONS_AVAILABLE var in wrangler.jsonc — the permission strings are
 * `${resource}.${action}` and `${resource}.${action}.any`.
 */
type Resource = "notes"; // Add your objects here
type Action = "read" | "create" | "update" | "delete";

export class AccessControl {
  /**
   * Universal Permission Check
   * * Logic Flow:
   * 1. Admin Bypass
   * 2. Check "Global" Permission (e.g., blogs.update.any) -> Allow if present
   * 3. Check "Standard" Permission (e.g., blogs.update)
   * -> If missing: Deny
   * -> If present: Enforce Ownership (User ID must match Resource Owner ID)
   */
  public authorize(user: SafeUser, resource: Resource, action: Action, resourceOwnerId?: string) {
    if (user.roles.includes("admin")) return true;

    const globalPermission = `${resource}.${action}.any`;
    if (user.permissions.includes(globalPermission)) {
      return true; // Access granted regardless of ownership
    }

    const standardPermission = `${resource}.${action}`;
    if (!user.permissions.includes(standardPermission)) {
      throw new HTTPException(403, {
        message: `Missing permission: ${standardPermission}`,
      });
    }

    if (resourceOwnerId) {
      if (user.id !== resourceOwnerId) {
        throw new HTTPException(403, {
          message: "You do not have permission to modify this resource.",
        });
      }
    }

    return true;
  }
}
