// worker/schema/roles.schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { z } from "zod";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { users } from "./auth.schema";

// Helper for generating UUIDs
const genId = () => crypto.randomUUID();

// ==========================================
// CONSTANTS
// ==========================================

export const ROLES = ["admin", "user"] as const;
export const PERMISSIONS = [
  "users.read",
  "users.write",
  "users.delete",
  "posts.read",
  "posts.write",
  "posts.delete",
  "comments.read",
  "comments.write",
  "comments.delete",
  "settings.read",
  "settings.write",
] as const;

// ==========================================
// DATABASE SCHEMA
// ==========================================

/**
 * User roles table
 */
export const userRoles = sqliteTable("user_roles", {
  id: text("id").primaryKey().$defaultFn(genId),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").notNull(),
  assignedAt: integer("assigned_at", { mode: "timestamp" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
  assignedBy: text("assigned_by").references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
});

/**
 * Role permissions table
 */
export const rolePermissions = sqliteTable("role_permissions", {
  id: text("id").primaryKey().$defaultFn(genId),
  role: text("role").notNull(),
  permission: text("permission").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
});

/**
 * Custom user permissions
 */
export const userPermissions = sqliteTable("user_permissions", {
  id: text("id").primaryKey().$defaultFn(genId),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  permission: text("permission", { enum: PERMISSIONS }).notNull(),
  granted: integer("granted", { mode: "timestamp" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
  grantedBy: text("granted_by").references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
});

// ==========================================
// RELATIONS
// ==========================================

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  assigner: one(users, {
    fields: [userRoles.assignedBy],
    references: [users.id],
  }),
}));

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, {
    fields: [userPermissions.userId],
    references: [users.id],
  }),
  granter: one(users, {
    fields: [userPermissions.grantedBy],
    references: [users.id],
  }),
}));

// ==========================================
// ZOD VALIDATION SCHEMAS
// ==========================================

/**
 * Base schemas from Drizzle tables
 */
export const insertUserRoleSchema = createInsertSchema(userRoles, {
  role: z.enum(ROLES),
  expiresAt: z.date().optional(), // Drizzle-zod handles int-to-date for timestamps automatically
});

export const selectUserRoleSchema = createSelectSchema(userRoles);

export const insertRolePermissionSchema = createInsertSchema(rolePermissions, {
  role: z.enum(ROLES),
  permission: z.enum(PERMISSIONS),
});

export const selectRolePermissionSchema = createSelectSchema(rolePermissions);

export const insertUserPermissionSchema = createInsertSchema(userPermissions, {
  permission: z.enum(PERMISSIONS),
  expiresAt: z.date().optional(),
});

export const selectUserPermissionSchema = createSelectSchema(userPermissions);

/**
 * API operation schemas
 * (Updated strict UUID validation to string validation since SQLite stores them as text,
 * but generally keeping .uuid() is fine for validation purposes)
 */

// Assign role to user
export const assignRoleSchema = z.object({
  userId: z.uuid("Invalid user ID"),
  role: z.enum(ROLES),
  expiresAt: z.string().datetime().optional(),
});

// Remove role from user
export const removeRoleSchema = z.object({
  userId: z.uuid("Invalid user ID"),
  role: z.enum(ROLES),
});

// Grant permission to user
export const grantPermissionSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  permission: z.enum(PERMISSIONS),
  expiresAt: z.string().datetime().optional(),
});

// Revoke permission from user
export const revokePermissionSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  permission: z.enum(PERMISSIONS),
});

// Check if user has permission
export const checkPermissionSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  permission: z.enum(PERMISSIONS),
});

// Query user roles
export const queryUserRolesSchema = z.object({
  userId: z.string().uuid().optional(),
  role: z.enum(ROLES).optional(),
  includeExpired: z.boolean().default(false),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
});

// Query role permissions
export const queryRolePermissionsSchema = z.object({
  role: z.enum(ROLES).optional(),
  permission: z.enum(PERMISSIONS).optional(),
});

// Bulk assign roles
export const bulkAssignRolesSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
  role: z.enum(ROLES),
  expiresAt: z.string().datetime().optional(),
});

// Bulk revoke roles
export const bulkRevokeRolesSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
  role: z.enum(ROLES),
});

// ==========================================
// TYPE EXPORTS
// ==========================================

export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type SelectUserRole = z.infer<typeof selectUserRoleSchema>;
export type AssignRole = z.infer<typeof assignRoleSchema>;
export type RemoveRole = z.infer<typeof removeRoleSchema>;

export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type SelectRolePermission = z.infer<typeof selectRolePermissionSchema>;

export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;
export type SelectUserPermission = z.infer<typeof selectUserPermissionSchema>;
export type GrantPermission = z.infer<typeof grantPermissionSchema>;
export type RevokePermission = z.infer<typeof revokePermissionSchema>;
export type CheckPermission = z.infer<typeof checkPermissionSchema>;

export type QueryUserRoles = z.infer<typeof queryUserRolesSchema>;
export type QueryRolePermissions = z.infer<typeof queryRolePermissionsSchema>;
export type BulkAssignRoles = z.infer<typeof bulkAssignRolesSchema>;
export type BulkRevokeRoles = z.infer<typeof bulkRevokeRolesSchema>;
