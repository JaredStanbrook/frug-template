# Search and sharing (SEO)

How a site built on this template gets found, shared and ranked, and how to
audit it. Everything here was done to a real site built from this template and
checked on a production build, then built into the template. The traps section
is what went wrong along the way. Read it before changing any of the pieces it
names.

## Contents

- [What is built in](#what-is-built-in)
- [Every public page](#every-public-page)
- [Titles and descriptions](#titles-and-descriptions)
- [Headings](#headings)
- [Canonicals, parameters and the sitemap](#canonicals-parameters-and-the-sitemap)
- [Traps that produce no error](#traps-that-produce-no-error)
- [Using and extending the built-in pieces](#using-and-extending-the-built-in-pieces)
  - [One URL per page](#one-url-per-page)
  - [The 404 page](#the-404-page)
  - [The share image](#the-share-image)
  - [Structured data](#structured-data)
  - [Caching](#caching)
  - [Keeping JavaScript off public pages](#keeping-javascript-off-public-pages)
  - [Fonts](#fonts)
- [Auditing a site](#auditing-a-site)
- [Owner actions that code cannot do](#owner-actions-that-code-cannot-do)
- [Content and links](#content-and-links)

## What is built in

Server rendering is the hard half. A crawler gets complete HTML with no
JavaScript step, links are plain `<a href>` (HTMX's `hx-boost` enhances them
without replacing them), and pages return real status codes. Don't add
prerendering or "SSR for SEO": it's already the architecture.

| Piece | Where | What it does |
| --- | --- | --- |
| Metadata | `worker/lib/seo.ts`, `renderer.middleware.tsx`, `Layout.tsx` | `<title>` as `"{title} · {APP_NAME}"`; a self-referencing canonical from `ORIGIN` (never the request host, and the query dropped); Open Graph and Twitter tags; `<html lang>` from `APP_LOCALE` |
| `noindex` defaults | `seo.ts` → `NOINDEX_PATHS` | `/login`, `/register`, `/join`, `/admin`, `/dev`, `/api`, and any URL with a query string |
| `robots.txt` | `worker/routes/seo.ts` | Production: disallows the paths above and names the sitemap. Anywhere else: `Disallow: /` |
| `sitemap.xml` | `worker/routes/seo.ts` | `STATIC_ROUTES`, plus database-backed URLs queried in the handler |
| One URL per page | `worker/middleware/canonical-url.middleware.ts` | HTTP → HTTPS and trailing slash → none, both 301s, plus HSTS |
| 404 page | `worker/views/pages/NotFound.tsx` | A real page with status 404 and `noindex`, for any missed page request |
| JSON-LD | `jsonLd` on `c.render`; builders in `worker/lib/structured-data.ts` | Escaped `<script type="application/ld+json">`; the home page emits `WebSite` |
| Share image | `APP_OG_IMAGE`; `scripts/og-image.mjs` | A default `og:image` for every page, generated from the site's own name, tagline, colours and logo |
| Caching | `public/_headers`; `CF_VERSION_METADATA` binding; `worker/lib/asset-version.ts` | `main.css` and the lazy chunks are cached for a year, and each deploy gets new URLs |
| Lean public pages | `ISLANDS` in `worker/components/main.ts` | Sign-in and profile components load only on pages that render them (−41% JS on other pages) |

The home page's title is `"{APP_TAGLINE} · {APP_NAME}"` and its description is
the tagline. That's a sensible default for the template, but a real site
should write both for its home page.

## Every public page

A page isn't finished until:

- [ ] `c.render(view, { title, description })` sets both, following the next
      section.
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

**A description is the snippet under the result**, written for a person
deciding whether to click. Aim for 70–155 characters; longer ones are
truncated. Say what the page contains and who it's for, make every description
unique, and make no claims the page doesn't back up. When a route gives none,
the layout falls back to `APP_TAGLINE`, which makes every such page look the
same to a search engine, so set one per page.

**Numbers in titles and descriptions come from data, not retyping.** A price in
a meta description that disagrees with the pricing page is worse than no price.
Compute it from the same constant the page renders:

```ts
const teamsFrom = (app: AppConfig) =>
  formatCents(TIERS.find((t) => t.id === "team")!.monthlyCents, app.locale, app.currency);

return c.render(<PricingPage app={c.var.app} />, {
  title: `Pricing: free plan, teams from ${teamsFrom(c.var.app)}`,
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
comes from classes, so fix the level and keep the class:

```tsx
<h2 class="text-2xl">{tier.name}</h2>   // was <h3 class="text-2xl">
```

Don't use a heading element purely to get a style.

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
`noindex` pages, nothing behind a guard. `sitemapXml` builds absolute HTTPS
URLs from `ORIGIN`. Beyond 50,000 URLs, split the file with a sitemap index.

**Set `lastmod` only where the date is real**: a post's `updatedAt`, or the
version date of a legal page. Google ignores `lastmod` on sites where it's
unreliable, so stamping the build date on every URL teaches it to ignore the
field. `changefreq` and `priority` are ignored by Google; harmless, but don't
spend time on them.

## Traps that produce no error

Each of these built, passed the tests, and was wrong. The built-in pieces
above exist because of them, so read the relevant one before changing that
piece.

**Cloudflare serves `http://` with a 200.** Unless the zone's "Always Use
HTTPS" setting is on, every page is reachable at two addresses. The canonical
tag says HTTPS, but crawlers still find and split signals across both. The
middleware redirects; also turn the setting on (owner action).

**`wrangler dev` rewrites the request host to the production domain** while
serving plain HTTP on localhost. A redirect that trusts `new URL(c.req.url)`
sees `http://yourdomain` and sends the local preview to itself forever. That's
why the middleware reads the visitor's scheme from Cloudflare's `CF-Visitor`
header: the edge always sets it and nothing local does. Don't "simplify" it to
`url.protocol`.

**A trailing slash was a 404.** Routes are declared without one, and the asset
layer's `auto-trailing-slash` applies to files, not Worker routes. The
middleware now redirects it.

**The asset layer's 404 is an empty body**: correct for a crawler, but a dead
end for a visitor. `worker.notFound` now renders the 404 page for page
requests, and only for those.

**A Vite `define` never reaches production.** `wrangler deploy` bundles
`worker/index.ts` itself (it's `main` in `wrangler.jsonc`), so a value injected
by `define` in `vite.config.ts` exists in `dist/` and nowhere that runs. Take
per-deploy values from the runtime: the version on `main.css` comes from the
`version_metadata` binding for exactly this reason.

**Versioning `client.js` with `?v=` runs it twice.** The lazy chunks import
shared code back from `/static/client.js` by that exact URL; a page that loaded
`client.js?v=abc` holds a *different* module, so the bundle executes twice and
the second run throws on `customElements.define` for an element that's already
registered. `main.css` is versioned; `client.js` keeps one URL and revalidates.
Don't version it and don't give it a long cache.

**A fallback version must not be a constant.** Where `CF_VERSION_METADATA` is
absent (tests, the Vite dev server), `assetVersion()` uses a per-isolate value.
A constant such as `"dev"`, reaching production through a lost binding, would
pin a stale stylesheet in every browser for a year.

**Structured data that the page doesn't show is spam.** Google treats JSON-LD
that disagrees with the visible content as a manual-action risk. That includes
an `aggregateRating` nobody gave, a `review` that doesn't exist, or FAQ entries
that aren't on the page. Generate it from the same data the page renders.

**`JSON.stringify` inside `<script>` isn't safe.** A string containing
`</script>` closes the element early. `jsonLdScript` escapes `<`; always go
through it, which `Layout.tsx` does for `jsonLd`.

**An `og:image` path must be absolute.** Previews fetch it from another origin,
and a relative path renders nothing. `resolveMeta` resolves `image` and
`APP_OG_IMAGE` against `ORIGIN`, so pass a path, not a hand-built URL.

**A crawl of a Cloudflare site finds pages you never made.** URLs like
`/cdn-cgi/content?id=…` about unrelated subjects are Cloudflare's *AI
Labyrinth*: hidden `noindex, nofollow` decoys shown only to clients it suspects
are unverified bots. A crawler that fakes a Googlebot user agent triggers it.
Real, verified Googlebot doesn't see it. Exclude `/cdn-cgi/` from audits and
don't "fix" it.

## Using and extending the built-in pieces

### One URL per page

`canonicalUrl` is mounted in `worker/index.ts` before the secrets check, since
a redirect needs neither config nor the database:

- **HTTPS redirect:** applies only to `ORIGIN`'s host when `ORIGIN` is HTTPS,
  so `*.workers.dev` previews and localhost are untouched.
- **Trailing-slash redirect:** applies only to `GET` and `HEAD`, because a
  redirected POST would lose its body.
- **Both are 301s:** the moves are permanent, and a permanent redirect passes a
  link's value on to the canonical URL.

If a URL ever genuinely moves, add a 301 from the old path. Don't leave it
returning 404, and don't 302 it.

### The 404 page

`renderNotFound(c)` renders `NotFoundPage` inside the layout with status 404
and `noindex`. `worker.notFound` uses it only when the asset layer also misses
**and** the request is a `GET` that accepts HTML; a missing file or an API call
keeps its plain 404.

**Replace its single "Back to the home page" link with the site's main pages.**
Keep the 404 status: a "not found" page that returns 200 is a soft 404, and
search engines treat it as thin content.

### The share image

`APP_OG_IMAGE` (empty by default) is the `og:image` for every page that doesn't
pass its own `image`. It's empty so no site ships the template's image. To set
it:

```bash
npm i -D playwright   # or: CHROMIUM_PATH=/opt/pw-browsers/chromium
node scripts/og-image.mjs          # writes public/og.png (1200×630)
# then in wrangler.jsonc: "APP_OG_IMAGE": "/og.png"
```

The script reads `APP_NAME`, `APP_TAGLINE`, the light-theme colour tokens and
`public/favicon.svg`, so the image matches the brand. Re-run it when any of
those change. 1200×630 is the size Facebook, LinkedIn, Slack and X all show
uncropped. A page with its own image passes `image: "/path.png"` on
`c.render`.

### Structured data

Pass `jsonLd: [...]` on `c.render`. `worker/lib/structured-data.ts` has the
builders that fit any site (`websiteSchema`, `faqSchema`). Add your own there,
**only for what the page visibly says**:

| Type | Where | Notes |
| --- | --- | --- |
| `WebSite` | Home only (built in) | `name`, `url`, `inLanguage` |
| `Organization` **or** `Person` | As the publisher | Whichever is the legal owner. A sole trader is a `Person`; don't invent a company |
| `SoftwareApplication` | Home or product page | `offers.price` = what the page says (`"0"` for free); `operatingSystem`, `downloadUrl`, `applicationCategory` |
| `Product` + `Offer` | Only for something bought at a listed price | Not for quoted or "contact us" pricing |
| `FAQPage` | A page with a visible Q&A list | `faqSchema(sameArrayThePageRenders)`. Google now shows FAQ rich results only for government and health sites, but other engines use it |
| `Article` / `BlogPosting` | Dated posts | Real `author`, `datePublished`, `dateModified` |
| `BreadcrumbList` | Sites two or more levels deep | Pointless on a flat site |
| `LocalBusiness` | A real physical location | Never for an online-only product |

**Never** add `aggregateRating` or `review` without real ones. Google shows
software rich results only when one of them exists, so honest markup won't
earn stars until real reviews exist, and that's the correct outcome.

Test it the way `tests/seo-site.test.ts` does: parse every
`application/ld+json` block on the rendered page, assert the types, and assert
there's no rating. For an FAQ, assert every marked-up question appears in the
page HTML. After deploying, run the URL through Google's Rich Results Test.

### Caching

`public/_headers` sets a year-long `immutable` cache on `/static/main.css` and
`/static/chunks/*`, and a day on `/og.png` and the favicon. That's safe because
their URLs change when their content does:

- **`main.css`** gets `?v={deployment id}` from the `CF_VERSION_METADATA`
  binding (`assetVersion(c)` in `worker/lib/asset-version.ts`), so each deploy
  asks for a new URL.
- **Chunks** are named `static/chunks/[name]-[hash].js` (`chunkFileNames` in
  `vite.config.ts`).
- **`client.js`** is deliberately absent and revalidates (see the traps).

If you add **self-hosted fonts**, add `/fonts/*` to `_headers` with the same
year-long cache. That's safe only if a changed font gets a new file name.

`wrangler dev` reads `_headers` like production, so `npm run preview` then
`curl -sI localhost:8787/static/main.css?v=… | grep -i cache-control` shows the
real value.

### Keeping JavaScript off public pages

`ISLANDS` in `worker/components/main.ts` maps each custom-element tag to a
dynamic import. `loadIslands()` runs on `DOMContentLoaded` and after every HTMX
swap, and imports a module only when its tag is on the page. The element then
upgrades itself. This keeps the WebAuthn client, the QR-code library and the
auth and profile components (41% of the bundle) off every page that doesn't
use them.

**A new client component:** import it at the top of `main.ts` if most pages
render it (like the theme, the toaster and the nav menu). Add one `ISLANDS`
entry per tag it defines if only a few pages do. Then check in a browser that
the page using it defines the element with no console errors, and that a page
not using it requests only `client.js`.

### Fonts

The template uses system font stacks, which is the fastest possible choice:
nothing to download, nothing to preload, no layout shift. If a site adds a web
font:
- self-host it with `@font-face` and `font-display: swap`, never a font CDN;
- cache it (see [Caching](#caching));
- preload the face the H1 uses, since the H1 is usually the LCP element. Preload
  two faces at most, because preloading everything delays the stylesheet:

```html
<link rel="preload" href="/fonts/<display-face>.woff2" as="font" type="font/woff2" crossorigin />
```

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
to the canonical, a 404 (the real page, for a browser), or the same page with a
canonical back.

**Verify on the real runtime.** Run `npm run preview` (or `wrangler dev` after
a build; it needs `JWT_SECRET` in `.dev.vars` and `npm run migrate:local`). It's
the same bundling and asset layer as `wrangler deploy`, so it catches what the
Vite dev server and unit tests can't: `_headers`, runtime bindings, asset
routing, and redirect behaviour.

**Measure Core Web Vitals under throttling:** Playwright with a CDP session,
`Network.emulateNetworkConditions` (~150 ms latency, 1.6 Mbps) and
`Emulation.setCPUThrottlingRate` at 4. Read LCP and CLS from a
`PerformanceObserver` added via `addInitScript`, and list render-blocking
resources from `performance.getEntriesByType("resource")`. Targets: LCP under
2.5 s, CLS under 0.1. A template site should manage CLS 0, with `main.css` as
the only render-blocking resource.

**Check mobile at 360 px:** no horizontal overflow (`scrollWidth` equals
`clientWidth`); interactive targets of at least 24 px, or `h-11` (44 px) for
primary controls; body text of at least 12 px; the same content as desktop.

## Owner actions that code cannot do

Tell the owner exactly these. Never claim any of them is done unless you did
it:

1. **Cloudflare → SSL/TLS → Edge Certificates → Always Use HTTPS.** It redirects
   at the edge, before the Worker runs. The middleware stays as the backstop.
2. **Google Search Console:** add a **Domain** property. It covers HTTP, HTTPS
   and subdomains. Google gives a TXT record: in Cloudflare → DNS → Records, add
   Type TXT, Name `@`, Google's value, then click Verify. Then Sitemaps → submit
   `https://<domain>/sitemap.xml`.
3. **Bing Webmaster Tools:** import the property from Search Console. Bing's
   index also feeds DuckDuckGo and several AI search tools.
4. **Analytics:** Cloudflare's zone analytics counts requests server-side with
   no script or cookie, and Search Console covers search performance. Adding a
   client-side tracker changes what a privacy notice must say, so update that
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
