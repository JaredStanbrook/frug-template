import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { authLogs, users } from "@server/schema/auth.schema";
import type { AppEnv } from "@server/types";
import { requireRole } from "@server/middleware/guard.middleware";
import { htmxResponse } from "@server/lib/htmx-helpers";

export const logsRoute = new Hono<AppEnv>();

logsRoute.use("*", requireRole("admin"));

logsRoute.get("/", async (c) => {
  const logs = await c.var.db
    .select({
      log: authLogs,
      user: users,
    })
    .from(authLogs)
    .leftJoin(users, eq(authLogs.userId, users.id))
    .orderBy(desc(authLogs.createdAt))
    .limit(200);

  const formatMetadata = (value: unknown) => {
    if (!value) return "—";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  return htmxResponse(
    c,
    "System Logs",
    <div class="max-w-5xl mx-auto space-y-8 p-8 pt-20 animate-in fade-in duration-500">
      <div class="space-y-2">
        <h2 class="text-3xl font-bold tracking-tight">System Logs</h2>
        <p class="text-muted-foreground">
          Authentication audit trail from <code>auth_logs</code>.
        </p>
      </div>

      <div class="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div class="relative w-full overflow-auto">
          <table class="w-full caption-bottom text-sm">
            <thead class="[&_tr]:border-b bg-muted/40">
              <tr class="border-b transition-colors text-left">
                <th class="h-12 px-4 align-middle font-medium text-muted-foreground">Created</th>
                <th class="h-12 px-4 align-middle font-medium text-muted-foreground">Event</th>
                <th class="h-12 px-4 align-middle font-medium text-muted-foreground">User</th>
                <th class="h-12 px-4 align-middle font-medium text-muted-foreground">Method</th>
                <th class="h-12 px-4 align-middle font-medium text-muted-foreground">IP</th>
                <th class="h-12 px-4 align-middle font-medium text-muted-foreground">Metadata</th>
              </tr>
            </thead>
            <tbody class="[&_tr:last-child]:border-0 bg-card">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} class="p-12 text-center text-muted-foreground">
                    No auth logs found.
                  </td>
                </tr>
              ) : (
                logs.map(({ log, user }) => (
                  <tr class="border-b align-top">
                    <td class="p-4 whitespace-nowrap text-sm text-muted-foreground">
                      {log.createdAt}
                    </td>
                    <td class="p-4">
                      <span class="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium uppercase tracking-wide">
                        {log.event}
                      </span>
                    </td>
                    <td class="p-4">
                      <div class="flex flex-col">
                        <span class="font-medium">
                          {user?.displayName || user?.email || log.userId || "System"}
                        </span>
                        {user?.email ? (
                          <span class="text-xs text-muted-foreground">{user.email}</span>
                        ) : null}
                      </div>
                    </td>
                    <td class="p-4 text-sm text-muted-foreground">{log.method || "—"}</td>
                    <td class="p-4 text-sm text-muted-foreground">{log.ipAddress || "—"}</td>
                    <td class="p-4">
                      <pre class="max-w-md overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
                        {formatMetadata(log.metadata)}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
  );
});
