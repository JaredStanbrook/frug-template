import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";

import { users } from "../worker/schema/auth.schema";
import { note } from "../worker/schema/note.schema";
import { createRealDb } from "./utils/realDb";

/**
 * The real-database helper itself. A join whose tables share a column name
 * (`id`, `created_at`) read back as objects keeps only one of them, so the
 * other table's field silently took its value, and a test of any joined
 * query was checking the wrong numbers.
 */
describe("createRealDb", () => {
  it("keeps both tables' columns in a join, even when their names match", async () => {
    const { db } = createRealDb();
    const at = "2026-01-01T00:00:00.000Z";
    await db.insert(users).values({ id: "user-1", email: "a@example.com", updatedAt: at });
    await db.insert(note).values({ id: 7, title: "Hi", userId: "user-1", updatedAt: at });

    const [row] = await db
      .select({ note, owner: users })
      .from(note)
      .innerJoin(users, eq(users.id, note.userId));

    expect(row.note.id).toBe(7);
    expect(row.owner.id).toBe("user-1");
  });
});
