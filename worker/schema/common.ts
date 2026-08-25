// worker/schema/common.ts

import { text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./auth.schema";

export const ownershipColumns = {
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: text("created_at")
    .default(sql`(current_timestamp)`)
    .notNull(),
  updatedAt: text("updated_at")
    .$onUpdate(() => sql`(current_timestamp)`)
    .notNull(),
};
