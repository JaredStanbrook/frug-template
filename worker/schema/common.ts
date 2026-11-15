// worker/schema/common.ts

import { text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./auth.schema";

/**
 * Timestamps alone, for rows that belong to the site rather than to a person.
 *
 * A release is published by an admin but is not *theirs* — it has to survive
 * that account being deleted, which `ownershipColumns` would not allow, since
 * its foreign key cascades.
 */
export const timestampColumns = {
  createdAt: text("created_at")
    .default(sql`(current_timestamp)`)
    .notNull(),
  updatedAt: text("updated_at")
    .$onUpdate(() => sql`(current_timestamp)`)
    .notNull(),
};

export const ownershipColumns = {
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  ...timestampColumns,
};
