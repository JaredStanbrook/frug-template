// worker/routes/admin/analytics.tsx — /admin/analytics, admins only (app.tsx).

import { Hono } from "hono";
import { eq } from "drizzle-orm";

import type { AppEnv } from "@server/types";
import { users } from "@server/schema/auth.schema";
import { offeredCategories } from "@server/config/cookies.config";
import { report, userJourney } from "@server/services/analytics.service";
import { AnalyticsPage, RANGES, UserJourneyPage } from "@views/admin/Analytics";

export const analyticsAdminRoute = new Hono<AppEnv>();

analyticsAdminRoute.get("/", async (c) => {
  const asked = Number(c.req.query("days"));
  const days = (RANGES as readonly number[]).includes(asked) ? asked : 30;
  // Full pages: links into them are boosted, and a fragment would lose the nav.
  return c.render(
    <AnalyticsPage
      report={await report(c, days)}
      app={c.var.app}
      consentOn={offeredCategories(c.env).includes("performance")}
    />,
    { title: "Analytics", noindex: true },
  );
});

analyticsAdminRoute.get("/users/:id", async (c) => {
  const id = c.req.param("id");
  const [user] = await c.var.db
    .select({ name: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, id));
  if (!user) return c.notFound();
  return c.render(
    <UserJourneyPage
      name={user.name || user.email || id}
      events={await userJourney(c, id)}
      app={c.var.app}
    />,
    { title: "Analytics", noindex: true },
  );
});
