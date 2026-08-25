// worker/routes/dev.tsx
//
// Read-only database inspector at /dev. It dumps every row of every table,
// so it is gated behind the `admin` role — do not loosen that. Delete this
// router entirely for sites that handle sensitive data.

import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { users, credentials, verificationCodes, authLogs } from "../schema/auth.schema";
import { userRoles, rolePermissions, userPermissions } from "../schema/roles.schema";
import { note } from "../schema/note.schema";
import { requireRole } from "../middleware/guard.middleware";
import { AppEnv } from "@server/types";

const devRouter = new Hono<AppEnv>();

devRouter.use("*", requireRole("admin"));

// Helper function to safely fetch table data
async function fetchTableData(db: any, table: any, tableName: string) {
  try {
    const data = await db.select().from(table);
    return { name: tableName, count: data.length, data };
  } catch (error) {
    return {
      name: tableName,
      count: 0,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

devRouter.get("/", async (c) => {
  const db = drizzle(c.env.DB);

  // Fetch all tables
  const tables = await Promise.all([
    // Auth tables
    fetchTableData(db, users, "users"),
    fetchTableData(db, credentials, "credentials"),
    fetchTableData(db, verificationCodes, "verification_codes"),
    fetchTableData(db, authLogs, "auth_logs"),

    // Role tables
    fetchTableData(db, userRoles, "user_roles"),
    fetchTableData(db, rolePermissions, "role_permissions"),
    fetchTableData(db, userPermissions, "user_permissions"),

    // Feature tables — add yours here.
    fetchTableData(db, note, "note"),
  ]);

  // Build HTML response
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Database Tables Viewer</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 2rem;
      line-height: 1.6;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    
    h1 {
      font-size: 2rem;
      margin-bottom: 1rem;
      color: #60a5fa;
    }
    
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .summary-card {
      background: #1e293b;
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    
    .summary-card h3 {
      font-size: 0.875rem;
      color: #94a3b8;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .summary-card .count {
      font-size: 1.5rem;
      color: #60a5fa;
      font-weight: bold;
    }
    
    .table-section {
      margin-bottom: 3rem;
    }
    
    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #334155;
    }
    
    .table-header h2 {
      font-size: 1.25rem;
      color: #60a5fa;
    }
    
    .table-header .badge {
      background: #1e40af;
      color: #dbeafe;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 600;
    }
    
    .error-badge {
      background: #dc2626 !important;
      color: #fee2e2 !important;
    }
    
    .table-wrapper {
      overflow-x: auto;
      background: #1e293b;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th {
      background: #334155;
      padding: 0.75rem;
      text-align: left;
      font-weight: 600;
      font-size: 0.875rem;
      color: #cbd5e1;
      border-bottom: 1px solid #475569;
      position: sticky;
      top: 0;
    }
    
    td {
      padding: 0.75rem;
      border-bottom: 1px solid #334155;
      font-size: 0.875rem;
    }
    
    tr:hover {
      background: #2d3748;
    }
    
    .empty-state {
      padding: 3rem;
      text-align: center;
      color: #64748b;
      font-style: italic;
    }
    
    .error-message {
      padding: 1rem;
      background: #7f1d1d;
      color: #fecaca;
      border-radius: 8px;
      margin-top: 1rem;
    }
    
    pre {
      background: #0f172a;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.75rem;
      color: #94a3b8;
    }
    
    .null-value {
      color: #64748b;
      font-style: italic;
    }
    
    .boolean-true {
      color: #22c55e;
    }
    
    .boolean-false {
      color: #ef4444;
    }
    
    .refresh-btn {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: #2563eb;
      color: white;
      border: none;
      padding: 1rem 1.5rem;
      border-radius: 9999px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      transition: all 0.2s;
    }
    
    .refresh-btn:hover {
      background: #1d4ed8;
      transform: translateY(-2px);
      box-shadow: 0 6px 8px rgba(0, 0, 0, 0.4);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🗄️ Database Tables Viewer</h1>
    
    <div class="summary">
      ${tables
        .map(
          (table) => `
        <div class="summary-card">
          <h3>${table.name}</h3>
          <div class="count">${table.count} ${table.count === 1 ? "record" : "records"}</div>
        </div>
      `,
        )
        .join("")}
    </div>
    
    ${tables
      .map(
        (table) => `
      <div class="table-section">
        <div class="table-header">
          <h2>${table.name}</h2>
          <span class="badge ${table.error ? "error-badge" : ""}">${table.count} records</span>
        </div>
        
        ${
          table.error
            ? `
          <div class="error-message">
            <strong>Error loading table:</strong> ${table.error}
          </div>
        `
            : table.data.length === 0
              ? `
          <div class="table-wrapper">
            <div class="empty-state">No records found</div>
          </div>
        `
              : `
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  ${Object.keys(table.data[0])
                    .map((key) => `<th>${key}</th>`)
                    .join("")}
                </tr>
              </thead>
              <tbody>
                ${table.data
                  .map(
                    (row: Record<string, unknown>) => `
                  <tr>
                    ${Object.entries(row)
                      .map(([key, value]) => {
                        let displayValue = value;
                        let className = "";

                        if (value === null || value === undefined) {
                          displayValue = "null";
                          className = "null-value";
                        } else if (typeof value === "boolean") {
                          displayValue = value.toString();
                          className = value ? "boolean-true" : "boolean-false";
                        } else if (typeof value === "object") {
                          displayValue = JSON.stringify(value, null, 2);
                        } else if (
                          key.toLowerCase().includes("hash") ||
                          key.toLowerCase().includes("secret")
                        ) {
                          displayValue = "••••••••";
                        }

                        return `<td class="${className}">${displayValue}</td>`;
                      })
                      .join("")}
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
        }
      </div>
    `,
      )
      .join("")}
    
    <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
  </div>
</body>
</html>
  `;

  return c.html(html);
});

// JSON endpoint for programmatic access
devRouter.get("/json", async (c) => {
  const db = drizzle(c.env.DB);

  const tables = await Promise.all([
    fetchTableData(db, users, "users"),
    fetchTableData(db, credentials, "credentials"),
    fetchTableData(db, verificationCodes, "verification_codes"),
    fetchTableData(db, authLogs, "auth_logs"),
    fetchTableData(db, userRoles, "user_roles"),
    fetchTableData(db, rolePermissions, "role_permissions"),
    fetchTableData(db, userPermissions, "user_permissions"),
    fetchTableData(db, note, "note"),
  ]);

  return c.json({
    timestamp: new Date().toISOString(),
    tables: tables.reduce(
      (acc, table) => {
        acc[table.name] = {
          count: table.count,
          data: table.data,
          ...(table.error && { error: table.error }),
        };
        return acc;
      },
      {} as Record<string, any>,
    ),
  });
});

export default devRouter;
