import { describe, it, expect } from "vitest";
import { Hono } from "hono";

import app from "../worker/app";
import type { AppEnv } from "../worker/types";
import type { AppConfig } from "../worker/config/app.config";
import { canonicalUrl } from "../worker/middleware/canonical-url.middleware";
import { renderNotFound } from "../worker/views/pages/NotFound";
import { jsonLdScript, resolveMeta } from "../worker/lib/seo";
import { createFakeDb, createMockData } from "./utils/fakeDb";

/**
 * Site-level search behaviour: one URL per page, a real 404 page, and
 * metadata a crawler and a link preview can use. See
 * .claude/skills/frugal/references/seo.md for why each of these exists.
 */

const appConfig: AppConfig = {
  name: "Test App",
  tagline: "Shared runbooks your whole team can run",
  locale: "en-AU",
  currency: "AUD",
  timezone: "UTC",
  origin: "https://example.com",
};

const prodEnv = { ORIGIN: "https://example.com" } as any;

/** The redirect middleware in front of a trivial page, as the worker mounts it. */
const redirectApp = () => {
  const h = new Hono<AppEnv>();
  h.use("*", canonicalUrl);
  h.get("*", (c) => c.text("ok"));
  h.post("*", (c) => c.text("posted"));
  return h;
};

describe("canonical URL enforcement", () => {
  it("sends HTTP to HTTPS on the production host, permanently", async () => {
    const res = await redirectApp().fetch(
      new Request("http://example.com/notes?x=1", {
        headers: { "CF-Visitor": '{"scheme":"http"}' },
      }),
      prodEnv,
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://example.com/notes?x=1");
  });

  it("trusts Cloudflare's scheme, not the URL, so a local preview cannot loop", async () => {
    // `wrangler dev` presents the production host over plain HTTP with no
    // CF-Visitor header. Redirecting that sent localhost back to itself.
    const res = await redirectApp().fetch(new Request("http://example.com/notes"), prodEnv);
    expect(res.status).toBe(200);
  });

  it("leaves other hosts alone", async () => {
    const res = await redirectApp().fetch(
      new Request("http://localhost/notes", { headers: { "CF-Visitor": '{"scheme":"http"}' } }),
      prodEnv,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("sets HSTS on the production host", async () => {
    const res = await redirectApp().fetch(new Request("https://example.com/"), prodEnv);
    expect(res.headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
  });

  it("strips a trailing slash with a 301, keeping the query", async () => {
    const res = await redirectApp().fetch(new Request("https://example.com/notes/?a=b"), prodEnv);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/notes?a=b");
  });

  it("never redirects the home page or a POST", async () => {
    expect((await redirectApp().fetch(new Request("https://example.com/"), prodEnv)).status).toBe(
      200,
    );
    const post = await redirectApp().fetch(
      new Request("https://example.com/notes/", { method: "POST" }),
      prodEnv,
    );
    expect(post.status).toBe(200);
  });
});

describe("not-found page", () => {
  it("is a real page with a 404 status, kept out of the index", async () => {
    const h = new Hono<AppEnv>();
    h.use("*", async (c, next) => {
      c.set("app", appConfig);
      c.set("auth", { user: null } as any);
      await next();
    });
    h.notFound(renderNotFound);

    const res = await h.fetch(new Request("https://example.com/nope"), prodEnv);
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain("That page isn&#39;t here");
    expect(html).toContain('content="noindex, follow"');
    expect(html).toContain('href="/"');
  });
});

describe("page metadata", () => {
  const at = new URL("https://example.com/notes");

  it("uses the site's default share image only when one is configured", () => {
    expect(resolveMeta({}, appConfig, at).image).toBeUndefined();
    expect(resolveMeta({}, { ...appConfig, ogImage: "/og.png" }, at).image).toBe(
      "https://example.com/og.png",
    );
    expect(resolveMeta({ image: "/x.png" }, { ...appConfig, ogImage: "/og.png" }, at).image).toBe(
      "https://example.com/x.png",
    );
  });

  it("cannot break out of its script element", () => {
    const out = jsonLdScript({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});

describe("home page", () => {
  const page = async () => {
    const wrapper = new Hono<AppEnv>();
    wrapper.use("*", async (c, next) => {
      c.set("db", createFakeDb(createMockData()) as any);
      c.set("app", appConfig);
      c.set("auth", { user: null, isRegistrationOpen: async () => true } as any);
      await next();
    });
    wrapper.route("/", app);
    return (await wrapper.fetch(new Request("https://example.com/"), prodEnv)).text();
  };

  it("says what the site is in its title, not just its name", async () => {
    const html = await page();
    expect(html).toContain(`<title>${appConfig.tagline} · ${appConfig.name}</title>`);
  });

  it("describes the site with WebSite JSON-LD and nothing invented", async () => {
    const blocks = [
      ...(await page()).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    ].map((m) => JSON.parse(m[1]));
    expect(blocks.map((b) => b["@type"])).toEqual(["WebSite"]);
    expect(blocks[0].url).toBe("https://example.com/");
    expect(blocks[0]).not.toHaveProperty("aggregateRating");
  });
});
