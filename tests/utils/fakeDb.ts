import { users, authLogs } from "../../worker/schema/auth.schema";
import { note } from "../../worker/schema/note.schema";

/**
 * A hand-rolled stand-in for a Drizzle D1 client.
 *
 * It is deliberately dumb: it records which table a query selected `from` and
 * replays a fixture array. That is enough to smoke-test that every page
 * renders, without a real D1 binding. For query-shape assertions, use
 * `wrangler d1 execute --local` against a real migration instead.
 */

export type MockData = {
  users: any[];
  notes: any[];
  authLogs: any[];
};

type QueryState = {
  fields?: Record<string, any> | undefined;
  fromTable?: unknown;
};

const resolveSelect = (data: MockData, state: QueryState) => {
  const fields = state.fields || {};

  // Joined selections are keyed by alias — match on the alias set.
  if ("log" in fields && "user" in fields) {
    return data.authLogs.map((log) => ({ log, user: data.users[0] ?? null }));
  }

  if ("count" in fields) {
    return [{ count: data.notes.length }];
  }

  switch (state.fromTable) {
    case users:
      return data.users;
    case note:
      return data.notes;
    case authLogs:
      return data.authLogs;
    default:
      return [];
  }
};

const createQuery = (data: MockData, fields?: Record<string, any>) => {
  const state: QueryState = { fields };
  const query: any = {
    from(table: unknown) {
      state.fromTable = table;
      return query;
    },
    where: () => query,
    innerJoin: () => query,
    leftJoin: () => query,
    groupBy: () => query,
    orderBy: () => query,
    limit: () => query,
    offset: () => query,
    get() {
      return Promise.resolve(resolveSelect(data, state)[0]);
    },
    returning() {
      return Promise.resolve(resolveSelect(data, state));
    },
    then(resolve: any, reject: any) {
      return Promise.resolve(resolveSelect(data, state)).then(resolve, reject);
    },
  };
  return query;
};

export const createFakeDb = (data: MockData) => ({
  select(fields?: Record<string, any>) {
    return createQuery(data, fields);
  },
  insert() {
    return {
      values() {
        return {
          returning() {
            return Promise.resolve([]);
          },
          then(resolve: any, reject: any) {
            return Promise.resolve([]).then(resolve, reject);
          },
        };
      },
    };
  },
  update() {
    return {
      set() {
        return {
          where() {
            return Promise.resolve([]);
          },
        };
      },
    };
  },
  delete() {
    return {
      where() {
        return Promise.resolve([]);
      },
    };
  },
  batch() {
    return Promise.resolve([]);
  },
});

export const createMockData = (): MockData => {
  const now = new Date().toISOString();
  const userId = "user-1";

  return {
    users: [
      {
        id: userId,
        username: "testuser",
        email: "test@example.com",
        displayName: "Test User",
        totpEnabled: false,
        isActive: true,
        emailVerified: true,
        phoneNumber: null,
        phoneVerified: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
        roles: ["admin"],
        permissions: ["notes.read", "notes.create", "notes.update", "notes.delete"],
      },
    ],
    notes: [
      {
        id: 1,
        title: "First note",
        body: "Body text",
        pinned: true,
        deletedAt: null,
        userId,
        createdAt: now,
        updatedAt: now,
      },
    ],
    authLogs: [
      {
        id: "log-1",
        userId,
        event: "login.success",
        method: "password",
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
        metadata: null,
        createdAt: now,
      },
    ],
  };
};
