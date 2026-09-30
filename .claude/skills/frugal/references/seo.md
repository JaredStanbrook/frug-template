# Search and sharing (SEO)

How a site built on this template gets found, shared and ranked, and how to
audit it. Everything here was done to a real site built from this template and
checked on a production build. The traps section is what went wrong along the
way.

## Contents

- [What the template already gives you](#what-the-template-already-gives-you)
- [Every public page](#every-public-page)
- [Titles and descriptions](#titles-and-descriptions)
- [Headings](#headings)
- [Canonicals, parameters and the sitemap](#canonicals-parameters-and-the-sitemap)
- [Traps that produce no error](#traps-that-produce-no-error)
- [Recipes a real site usually needs](#recipes-a-real-site-usually-needs)
  - [One URL per page: HTTPS and trailing slashes](#one-url-per-page-https-and-trailing-slashes)
  - [A real 404 page](#a-real-404-page)
  - [A share image](#a-share-image)
  - [Structured data](#structured-data)
  - [Caching static files](#caching-static-files)
  - [Less JavaScript on public pages](#less-javascript-on-public-pages)
  - [Fonts](#fonts)
- [Auditing a site](#auditing-a-site)
- [Owner actions that code cannot do](#owner-actions-that-code-cannot-do)
- [Content and links](#content-and-links)

## What the template already gives you

Server rendering is the hard half. A crawler gets complete HTML with no
JavaScript step, links are plain `<a href>` (HTMX's `hx-boost` enhances them
without replacing them), and pages return real status codes. Don't add
prerendering or "SSR for SEO": it's already the architecture.

`worker/lib/seo.ts` plus `renderer.middleware.tsx` already provide:

- **`<title>`:** `"{title} · {APP_NAME}"`, or `APP_NAME` alone when a route
  sets no title.
- **A self-referencing canonical** built from `ORIGIN` and the path, never from
  the request host, so a `*.workers.dev` preview can't compete with the real
  domain. The query string is dropped.
- **`noindex`** on `/login`, `/register`, `/join`, `/admin`, `/dev`, `/api`, and
  on any URL with a query string (see the parameter trap below).
- **Open Graph and Twitter tags** from the same values, and `<html lang>` from
  `APP_LOCALE`.
- **`robots.txt`:** in production it disallows the paths above and names the
  sitemap; anywhere else it disallows everything, so staging can never be
  indexed.
- **`sitemap.xml`:** `STATIC_ROUTES` in `worker/routes/seo.ts`, plus any
  database-backed URLs queried in that handler.

What it doesn't provide, and what most real sites should add, is in
[Recipes](#recipes-a-real-site-usually-needs): an HTTPS and trailing-slash
redirect, a real 404 page, a default share image, structured data, long-lived
caching, and keeping staff-only JavaScript off public pages.

## Every public page

A page isn't finished until:

- [ ] `c.render(view, { title, description })` sets both, following the next
      section. Never leave the home page's title as the bare site name.
- [ ] It has exactly **one `<h1>`** that says what the page is, and no
      skipped heading levels.
- [ ] It's in `STATIC_ROUTES` in `worker/routes/seo.ts` if a signed-out visitor
      can load it, and **not** if they can't.
- [ ] It's reachable by a link: `menuConfig` in `NavBar.tsx`, the footer, or a
      contextual link with descriptive anchor text ("compare plans", not "click
      here"). A page only the sitemap knows about is an orphan.
- [ ] Images that carry meaning have `alt` text describing them; decorative
      ones have `alt=""`. Every `<img>` has `width` and `height`, so nothing
      shifts while it loads.
- [ ] It's in `tests/ui-pages.test.ts`.

## Titles and descriptions

**A title names the page's subject in the words a searcher would use.**
"Pricing · Acme" is weak; "Pricing: free plan, teams from $6 · Acme" tells a
searcher what they'll find. Keep titles unique across the site, and under about
60 characters including the site-name suffix, because longer ones are cut off.
Don't give every page the same template ("X | Best Y Software | Acme"); each
title should be written for its page.

The home page especially: its title is the site's entry in brand searches, and
the name alone tells someone who hasn't heard of it nothing. Give it a title
that says what the product is.

**A description is the snippet under the result**, written for a person
deciding whether to click. Aim for 70–155 characters; longer ones are
truncated. Say what the page contains and who it's for, make every description
unique, and make no claims the page doesn't back up. The layout falls back to
`APP_TAGLINE` when a route gives none, which makes every such page look the
same to a search engine, so set one per page.

**Numbers in titles and descriptions come from data, not retyping.** A price in
a meta description that disagrees with the pricing page is worse than no price.
Compute it from the same constant the page renders:

```ts
const hostedFrom = (app: AppConfig) =>
  formatPrice(TIERS.find((t) => t.id === "team")!.monthlyCents, app.locale, app.currency);

return c.render(<PricingPage app={c.var.app} />, {
  title: `Pricing: free plan, teams from ${hostedFrom(c.var.app)}`,
  description: `…`,
});
```

**Test the rules so they stay true.** A render test that walks the public
pages and asserts each title is unique and ≤ 65 characters, and each
description is 70–160 characters, costs twenty lines and stops the next page
from quietly regressing.

**Don't write for keywords.** Use the terms a searcher would use where they
fit naturally. Repeating them, or adding a paragraph to "target" a phrase,
reads as spam to people and to search engines alike.

## Headings

One `<h1>` per page, then `<h2>` for sections and `<h3>` inside them, with no
level skipped. The trap is card grids: a row of cards directly under the H1
gets `<h3>` "because it looks right", and the outline jumps H1 → H3. The size
comes from classes in this template, so fix the level and keep the class:

```tsx
<h2 class="text-2xl">{tier.name}</h2>   // was <h3 class="text-2xl">
```

Footer column labels as `<h2>` are fine: they label navigation, and demoting
them gains nothing. Don't use a heading element purely to get a style.

## Canonicals, parameters and the sitemap

**Every indexable page canonicalises to itself** without you doing anything.
Override `canonical` only when a page genuinely duplicates another URL.

**A parameter that only changes the UI, not the content, should be canonical
only, not `noindex`.** The default of `noindex` for any query string is right
for search results (`?q=`) and pagination. But `/contact?topic=sales`, which
just highlights a card, would get *both* `noindex` and a canonical to
`/contact`. Those are conflicting signals: `noindex` can win and lose the
consolidation. On routes like that, pass `noindex: false`:

```ts
return c.render(<ContactPage topic={c.req.query("topic")} />, {
  title: "Contact",
  description: "…",
  noindex: false, // ?topic= only highlights a card; the canonical consolidates it
});
```

**The sitemap lists canonical, indexable URLs only**: no redirects, no
`noindex` pages, nothing behind a guard. Use absolute HTTPS URLs; `sitemapXml`
builds them from `ORIGIN`. Beyond 50,000 URLs, split the file with a sitemap
index.

**Set `lastmod` only where the date is real**: a post's `updatedAt`, or the
version date of a legal page. Google ignores `lastmod` on sites where it's
unreliable, so stamping the build date on every URL teaches it to ignore the
field. `changefreq` and `priority` are ignored by Google; harmless, but don't
spend time on them.

## Traps that produce no error

Each of these built, passed the tests, and was wrong.

**Cloudflare serves `http://` with a 200.** Unless the zone's "Always Use
HTTPS" setting is on, every page is reachable at two addresses. The canonical
tag says HTTPS, but crawlers still find and split signals across both. Fix it
at the edge (owner action) *and* in the Worker (recipe below).

**`wrangler dev` rewrites the request host to the production domain** while
serving plain HTTP on localhost. A redirect that trusts `new URL(c.req.url)`
sees `http://yourdomain` and sends the local preview to itself forever. Read
the visitor's scheme from Cloudflare's `CF-Visitor` header instead: the edge
always sets it and nothing local does, so without it the redirect does nothing
rather than loop.

**A trailing slash is a 404.** Routes are declared without one, and the asset
layer's `auto-trailing-slash` applies to files, not Worker routes. So
`/pricing/` from any link or typed URL is lost. Redirect it (recipe below).

**The 404 is an empty body.** `worker.notFound` falls through to `ASSETS.fetch`,
which returns a 0-byte 404 for an unknown page. The status code is correct, but
the visitor hits a dead end with no way back in.

**A Vite `define` never reaches production.** `wrangler deploy` bundles
`worker/index.ts` itself (it's `main` in `wrangler.jsonc`), so a value injected
by `define` in `vite.config.ts` exists in `dist/` and nowhere that runs. Anything
per-deploy must come from the runtime. For a version string, use the
`version_metadata` binding (recipe below).

**Versioning `client.js` with `?v=` runs it twice** once any code is lazily
loaded. Vite's dynamic chunks import shared code back from `/static/client.js`
by that exact URL; a page that loaded `client.js?v=abc` holds a *different*
module, so the bundle executes twice. The second run throws on
`customElements.define` for an element that's already registered. Version the
stylesheet, but keep the entry script on one URL.

**Structured data that the page doesn't show is spam.** Google treats JSON-LD
that disagrees with the visible content as a manual-action risk. That includes
an `aggregateRating` nobody gave, a `review` that doesn't exist, or FAQ entries
that aren't on the page. Generate it from the same data the page renders.

**`JSON.stringify` inside `<script>` isn't safe.** A string containing
`</script>` closes the element early. Escape `<` as `<` (recipe below).

**An `og:image` path must be absolute.** Previews fetch it from another origin,
and a relative path renders nothing. `resolveMeta` already resolves `image`
against `ORIGIN`, so pass a path, not a hand-built URL.

**A crawl of a Cloudflare site finds pages you never made.** URLs like
`/cdn-cgi/content?id=…` about unrelated subjects are Cloudflare's *AI
Labyrinth*: hidden `noindex, nofollow` decoys shown only to clients it suspects
are unverified bots. A crawler that fakes a Googlebot user agent triggers it.
Real, verified Googlebot doesn't see it. Exclude `/cdn-cgi/` from audits and
don't "fix" it.

## Recipes a real site usually needs

None of these ship in the template, because what's right depends on the site.
Each is small and was verified on a production build.

### One URL per page: HTTPS and trailing slashes

`worker/middleware/canonical-url.middleware.ts`, mounted in `worker/index.ts`
before the other middleware (`worker.use("*", canonicalUrl)`):

```ts
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

export const canonicalUrl: MiddlewareHandler<AppEnv> = async (c, next) => {
  const url = new URL(c.req.url);
  const origin = c.env.ORIGIN ? new URL(c.env.ORIGIN) : null;
  const isCanonicalHost =
    origin !== null && origin.protocol === "https:" && url.hostname === origin.hostname;
  const isRead = c.req.method === "GET" || c.req.method === "HEAD";

  // CF-Visitor, not url.protocol: `wrangler dev` presents the production host
  // over plain HTTP, and trusting the URL loops a local preview forever.
  if (isCanonicalHost && visitorScheme(c.req.header("CF-Visitor")) === "http") {
    url.protocol = "https:";
    return c.redirect(url.toString(), 301);
  }

  // GET/HEAD only: a redirected POST loses its body.
  if (isRead && url.pathname.length > 1 && url.pathname.endsWith("/")) {
    return c.redirect((url.pathname.replace(/\/+$/, "") || "/") + url.search, 301);
  }

  await next();
  if (isCanonicalHost && url.protocol === "https:") {
    c.header("Strict-Transport-Security", "max-age=31536000");
  }
};

const visitorScheme = (header: string | undefined): string | null => {
  try {
    const scheme = header ? (JSON.parse(header) as { scheme?: unknown }).scheme : null;
    return typeof scheme === "string" ? scheme : null;
  } catch {
    return null;
  }
};
```

Both are 301s, because the moves are permanent and a permanent redirect passes
a link's value on. Test it on a bare Hono app with `canonicalUrl` in front of
a catch-all. Include the case with no `CF-Visitor` header, which must return
200: that's the no-loop guarantee.

### A real 404 page

The not-found handler runs at the Worker level, outside the app's renderer
middleware, so render the layout directly:

```tsx
// worker/views/pages/NotFound.tsx
export const renderNotFound = (c: Context<AppEnv>) => {
  const meta = resolveMeta({ title: "Page not found", noindex: true }, c.var.app, new URL(c.req.url));
  return c.html(
    <Layout meta={meta} app={c.var.app} user={c.var.auth?.user ?? null} currentPath={c.req.path}>
      <NotFoundPage />  {/* an h1, one line, links to the main pages */}
    </Layout>,
    404,
  );
};
```

```ts
// worker/index.ts — only a missed *page* gets it; files and API calls keep a plain 404
worker.notFound(async (c) => {
  const wantsPage = c.req.method === "GET" && (c.req.header("Accept") ?? "").includes("text/html");
  let response: Response;
  try {
    response = await c.env.ASSETS.fetch(c.req.raw);
  } catch {
    response = c.text("Not found", 404);
  }
  return response.status === 404 && wantsPage ? renderNotFound(c) : response;
});
```

Keep the 404 status and `noindex`. A "404 page" that returns 200 is a soft 404,
and search engines treat it as thin content.

### A share image

Without an `og:image`, every shared link renders as a bare card. Make one
1200×630 PNG, the size Facebook, LinkedIn, Slack and X all show uncropped, and
use it as the default:

```ts
// worker/lib/seo.ts, in resolveMeta
image: new URL(meta.image ?? "/og.png", origin).toString(),
```

In `Layout.tsx`, next to `og:image`, emit `og:image:width` (1200),
`og:image:height` (630) and `og:image:alt`, plus `twitter:title` and
`twitter:description`.

Render the image from the site itself rather than designing it separately, so
it can't drift from the brand. That means a small Playwright script that loads
the self-hosted fonts as data URLs, inlines the logo SVG, sets the headline and
screenshots a 1200×630 viewport to `public/og.png`. Add a one-day
`Cache-Control` for it (see [Caching](#caching-static-files)).

### Structured data

Add a `jsonLd?: Record<string, unknown>[]` field to `PageMeta`, and pass it
through `resolveMeta` (defaulting to `[]`). Emit each item in `Layout.tsx`, raw
but escaped:

```ts
export const jsonLdScript = (data: Record<string, unknown>) =>
  JSON.stringify(data).replace(/</g, "\\u003c");
// Layout.tsx: html`<script type="application/ld+json">${raw(jsonLdScript(d))}</script>`
```

Build the objects in one module (`worker/lib/structured-data.ts`), and **only
for what the page visibly says**:

| Type | Where | Notes |
| --- | --- | --- |
| `WebSite` | Home only | `name`, `url`, `inLanguage`, `publisher` |
| `Organization` **or** `Person` | As the publisher | Whichever is the legal owner. A sole trader is a `Person`; don't invent a company |
| `SoftwareApplication` | Home or product page | `offers.price` = what the page says (`"0"` for free); `operatingSystem`, `downloadUrl`, `applicationCategory` |
| `Product` + `Offer` | Only for something bought at a listed price | Not for quoted or "contact us" pricing |
| `FAQPage` | A page with a visible Q&A list | Generate it from the same array the page renders. Google now shows FAQ rich results only for government and health sites, but other engines use it |
| `Article` / `BlogPosting` | Dated posts | Real `author`, `datePublished`, `dateModified` |
| `BreadcrumbList` | Sites two or more levels deep | Pointless on a flat site |
| `LocalBusiness` | A real physical location | Never for an online-only product |

**Never** add `aggregateRating` or `review` without real ones. Google shows
software rich results only when one of them exists, so honest markup won't
earn stars until real reviews exist, and that's the correct outcome.

Test it: parse every `application/ld+json` block on the rendered page, assert
the types, assert there's no rating, and for an FAQ assert every marked-up
question appears in the page HTML. After deploying, run the URL through Google's
Rich Results Test.

### Caching static files

Out of the box every asset is served with `max-age=0, must-revalidate`, so a
returning visitor re-checks the stylesheet and every font on each page view.
Workers static assets read a `_headers` file from the assets directory, so put
one in `public/`:

```
/static/main.css
  Cache-Control: public, max-age=31536000, immutable

/static/chunks/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/og.png
  Cache-Control: public, max-age=86400
```

A year-long cache is only safe if the URL changes when the file does:

- **`main.css`** has a fixed name, so version it per deploy with the
  `version_metadata` binding. In `wrangler.jsonc`, add
  `"version_metadata": { "binding": "CF_VERSION_METADATA" }`. Add
  `CF_VERSION_METADATA: WorkerVersionMetadata` to `Bindings` in
  `worker/types.ts`. Then render
  `href="/static/main.css?v=${c.env.CF_VERSION_METADATA?.id}"`. Fall back to a
  per-isolate value, never a constant, where the binding is absent (tests, dev):
  a constant fallback would cache a stale stylesheet for a year.
- **Lazy chunks** set `chunkFileNames: "static/chunks/[name]-[hash].js"` in the
  client build, so they carry a content hash.
- **`client.js`** stays out of `_headers` and keeps one unversioned URL (see the
  trap above). It revalidates, which costs a 304 per navigation.
- **Fonts** are never edited in place: replacing one means a new file name.

Verify with `npm run preview` (`wrangler dev` serves `_headers` like
production): `curl -sI localhost:8787/static/main.css?v=… | grep -i cache-control`.

### Less JavaScript on public pages

`worker/components/main.ts` imports every client component eagerly, so every
visitor downloads the WebAuthn client, the QR-code library and the auth and
profile components, even though only `/login`, `/register` and `/profile` use
them. On a real site that was 39% of the public-page bundle. Load them when
their element is actually on the page:

```ts
const ISLANDS: Record<string, () => Promise<unknown>> = {
  "auth-login": () => import("./auth/AuthLogin"),
  "auth-register": () => import("./auth/AuthRegister"),
  "totp-verify-modal": () => import("./auth/TotpVerifyModal"),
  "totp-setup-button": () => import("./auth/TotpSetupButton"),
  "profile-editable-name": () => import("./ui/ProfileIslands"),
  // …one entry per tag a lazy module defines
};

const loadIslands = (root: ParentNode = document) => {
  for (const [tag, load] of Object.entries(ISLANDS)) {
    if (!customElements.get(tag) && root.querySelector(tag)) load();
  }
};

document.addEventListener("DOMContentLoaded", loadIslands);
document.body.addEventListener("htmx:afterSwap", () => loadIslands()); // fragments can bring one in
```

Elements already in the DOM upgrade themselves when their module defines them.
Keep eager whatever every page uses: the theme, the toaster, the nav menu. Then
check in a browser that `/login` defines `auth-login` with no console errors,
and that a public page requests only `client.js`.

### Fonts

The template self-hosts its fonts with `font-display: swap`, which is right: no
third-party request and no invisible text. The LCP element on most pages is
the H1, so preload the face it uses, and the body face, in `Layout.tsx`:

```html
<link rel="preload" href="/fonts/<display-face>.woff2" as="font" type="font/woff2" crossorigin />
```

Preload two at most; preloading everything delays the stylesheet.

## Auditing a site

**Crawl it the way a search engine sees it:** server HTML with JavaScript off.
Fetch each URL with `fetch()`, then parse it with Playwright's
`page.setContent(html)` in a `javaScriptEnabled: false` context. That avoids
navigating, which also sidesteps a sandbox proxy's certificate (or pass
`ignoreHTTPSErrors: true`).

Start from `/` plus every `<loc>` in `/sitemap.xml`, follow same-origin links,
and exclude `/cdn-cgi/`. For each page record:
- status, redirect target and `X-Robots-Tag`;
- `<title>`, meta description, canonical and meta robots;
- the H1–H3 outline;
- word count of `<main>`;
- `og:*` tags, JSON-LD blocks, `<img>` alt, width and height;
- links in and out.

Then flag:
- missing or duplicate titles, and descriptions over 160 characters;
- anything other than exactly one H1, and skipped heading levels;
- canonicals that point elsewhere or to a non-200;
- `noindex` pages in the sitemap;
- pages with no inbound links;
- broken links.

**Probe the variants by hand:** `http://`, `www.`, a trailing slash, upper
case, `?utm_source=x`, `/index.html` and a nonsense path. Each should be a 301
to the canonical, a 404, or the same page with a canonical back.

**Verify on the real runtime.** Run `npm run preview` (or `wrangler dev` after
a build). It's the same bundling and asset layer as `wrangler deploy`, so it
catches what the Vite dev server and unit tests can't: `_headers`, `define`
values and asset routing.

**Measure Core Web Vitals under throttling:** Playwright with a CDP session,
`Network.emulateNetworkConditions` (~150 ms latency, 1.6 Mbps) and
`Emulation.setCPUThrottlingRate` at 4. Read LCP and CLS from a
`PerformanceObserver` added via `addInitScript`, and list render-blocking
resources from `performance.getEntriesByType("resource")`. Targets: LCP under
2.5 s, CLS under 0.1. A template site should manage CLS 0, with `main.css` as
the only render-blocking resource.

**Check mobile at 360 px:** no horizontal overflow (`scrollWidth` equals
`clientWidth`); interactive targets of at least 24 px, or 44 px for primary
controls; body text of at least 12 px; the same content as desktop.

## Owner actions that code cannot do

Tell the owner exactly these. Never claim any of them is done unless you did
it:

1. **Cloudflare → SSL/TLS → Edge Certificates → Always Use HTTPS.** It redirects
   at the edge, before the Worker runs. Keep the Worker redirect as the
   backstop.
2. **Google Search Console:** add a **Domain** property. It covers HTTP, HTTPS
   and subdomains. Google gives a TXT record: in Cloudflare → DNS → Records, add
   Type TXT, Name `@`, Google's value, then click Verify. Then Sitemaps → submit
   `https://<domain>/sitemap.xml`.
3. **Bing Webmaster Tools:** import the property from Search Console. Bing's
   index also feeds DuckDuckGo and several AI search tools.
4. **Analytics:** Cloudflare's zone analytics counts requests server-side with
   no script or cookie, and Search Console covers search performance. Adding a
   client-side tracker changes what the privacy notice must say, so update that
   first.
5. After deploying, run the home page through the **Rich Results Test**, and
   share one URL in Slack or LinkedIn to see the preview card.

## Content and links

Technical SEO only removes obstacles. What ranks is a page that fully answers
its searcher's question.

- **Satisfy the intent, don't pad for keywords.** Use the words a searcher uses
  where they fit. Never add paragraphs, near-duplicate pages or hidden text to
  "target" a phrase: it's spam, and search engines treat it as such.
- **A thin page usually means missing substance, not missing words.** Add what
  the reader needs (a worked example, requirements, a comparison), or accept
  that a utility page such as a contact or bug-report form is short.
- **Two pages chasing the same query compete.** Give each page one job, and
  link between related pages instead.
- **Supporting content earns its place** only when there's something real to
  say: a guide to the core use case, setup documentation, release notes with
  their own URLs.
- **Links from other sites** come from being worth linking to: launch posts
  (Show HN, Product Hunt), relevant directories, the ecosystems the product is
  built on, genuinely useful write-ups, and helpful answers in communities that
  allow them. Never buy links, join link networks or PBNs, or automate outreach.
