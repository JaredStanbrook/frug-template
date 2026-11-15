import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";

import type { AppEnv } from "@server/types";
import { accessLink, accessLinkFormSchema } from "@server/schema/access.schema";
import { AccessControl } from "@server/services/access.service";
import { gateMode } from "@server/services/access-gate.service";
import { randomBase64Url } from "@server/lib/crypto";
import { flashToast, htmxToast } from "@server/lib/htmx-helpers";
import { AccessPage, AccessLinkRow } from "@views/admin/Access";

/** Invitation links for the access gate. Mounted under the admin sub-app. */
export const accessAdminRoute = new Hono<AppEnv>();

const access = new AccessControl();

accessAdminRoute.get("/", async (c) => {
  access.authorize(c.var.auth.user!, "access", "read");

  const links = await c.var.db.select().from(accessLink).orderBy(desc(accessLink.id));

  return c.render(<AccessPage links={links} app={c.var.app} mode={gateMode(c.env)} />, {
    title: "Access links",
  });
});

accessAdminRoute.post(
  "/",
  zValidator("form", accessLinkFormSchema, (result, c) => {
    if (!result.success) {
      flashToast(c, "Say who the link is for, and pick a length", { type: "error" });
      return c.redirect("/admin/access");
    }
  }),
  async (c) => {
    const user = c.var.auth.user!;
    access.authorize(user, "access", "create");

    const { label, durationHours } = c.req.valid("form");
    await c.var.db.insert(accessLink).values({
      token: randomBase64Url(32),
      label,
      durationHours,
      createdBy: user.id,
      updatedAt: new Date().toISOString(),
    });

    flashToast(c, `Link created for ${label}`);
    return c.redirect("/admin/access");
  },
);

accessAdminRoute.post("/:id/revoke", async (c) => {
  access.authorize(c.var.auth.user!, "access", "update");

  const id = Number(c.req.param("id"));
  const now = new Date().toISOString();
  const [updated] = await c.var.db
    .update(accessLink)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(accessLink.id, id), isNull(accessLink.revokedAt)))
    .returning();

  if (!updated) {
    htmxToast(c, "That link is already revoked", { type: "error" });
    return c.body(null, 404);
  }

  htmxToast(c, "Link revoked");
  return c.html(<AccessLinkRow link={updated} app={c.var.app} />);
});
