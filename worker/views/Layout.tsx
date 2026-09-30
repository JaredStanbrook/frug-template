import { html, raw } from "hono/html";
import type { FC, Child } from "hono/jsx";
import { type PropsUser } from "@server/schema/auth.schema";
import type { AppConfig } from "@server/config/app.config";
import { jsonLdScript, type ResolvedMeta } from "@server/lib/seo";
import { NavBar } from "./components/NavBar";

interface LayoutProps {
  meta: ResolvedMeta;
  children?: Child;
  app: AppConfig;
  user?: PropsUser | null;
  currentPath?: string;
  headExtra?: Child;
  /**
   * Appended to the stylesheet URL so each deploy gets a new one. Its file
   * name is fixed (`static/main.css`), so without it the stylesheet could not
   * be cached for long; with it, `public/_headers` caches it for a year and a
   * deploy still reaches every browser at once. See lib/asset-version.ts.
   *
   * Not appended to `client.js`: the lazily loaded chunks import shared code
   * back from `/static/client.js` by that exact URL, and a browser treats
   * `client.js?v=…` as a different module — so it would run the bundle twice,
   * and the second run fails to re-register its custom elements.
   */
  assetVersion: string;
}

export const Layout: FC<LayoutProps> = (props) => {
  const isProd = import.meta.env ? import.meta.env.PROD : true;

  return html`
    <!DOCTYPE html>
    <html lang="${props.meta.locale}">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${props.meta.title}</title>
        ${
          props.meta.description
            ? html`<meta name="description" content="${props.meta.description}" />`
            : ""
        }

        <!-- Points every variant of this page (trailing slash, ?q=…, utm tags)
             at one address, so a crawler ranks one page instead of splitting
             its signals across near-duplicates. -->
        <link rel="canonical" href="${props.meta.canonical}" />
        ${props.meta.noindex ? html`<meta name="robots" content="noindex, follow" />` : ""}

        <!-- Link previews. Without these a shared URL renders as a bare link. -->
        <meta property="og:type" content="${props.meta.type}" />
        <meta property="og:title" content="${props.meta.title}" />
        <meta property="og:url" content="${props.meta.canonical}" />
        <meta property="og:site_name" content="${props.meta.siteName}" />
        <meta property="og:locale" content="${props.meta.locale.replace("-", "_")}" />
        ${
          props.meta.description
            ? html`<meta property="og:description" content="${props.meta.description}" />`
            : ""
        }
        ${
          props.meta.image
            ? html`<meta property="og:image" content="${props.meta.image}" />
                <meta property="og:image:alt" content="${props.meta.siteName}" />
                <meta name="twitter:card" content="summary_large_image" />`
            : html`<meta name="twitter:card" content="summary" />`
        }
        <meta name="twitter:title" content="${props.meta.title}" />
        ${
          props.meta.description
            ? html`<meta name="twitter:description" content="${props.meta.description}" />`
            : ""
        }
        ${props.meta.jsonLd.map(
          (data) =>
            html`<script type="application/ld+json">
              ${raw(jsonLdScript(data))}
            </script>`,
        )}

        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <!-- The two faces above the fold. Without a preload the browser only
             discovers them after parsing the stylesheet, and the headline
             visibly swaps. crossorigin is required even same-origin. -->
        <link
          rel="preload"
          href="/fonts/michroma-400.woff2"
          as="font"
          type="font/woff2"
          crossorigin
        />
        <link
          rel="preload"
          href="/fonts/plex-sans-400.woff2"
          as="font"
          type="font/woff2"
          crossorigin
        />
        ${
          isProd
            ? html`<link rel="stylesheet" href="/static/main.css?v=${props.assetVersion}" />`
            : html`<link rel="stylesheet" href="/worker/index.css" />`
        }
        <script
          type="module"
          src="${isProd ? "/static/client.js" : "/worker/components/main.ts"}"
        ></script>
        ${props.headExtra}
      </head>
      <body class="bg-background text-foreground antialiased min-h-screen font-sans flex flex-col">
        <theme-provider defaultTheme="system"></theme-provider>

        ${
          props.meta.bare
            ? html`<header class="border-b">
                <div class="flex h-14 items-center px-4 font-display text-base tracking-wide">
                  ${props.app.name}
                </div>
                <div class="retro-stripes h-[9px]" aria-hidden="true"></div>
              </header>`
            : NavBar({
                appName: props.app.name,
                user: props.user,
                currentPath: props.currentPath,
              })
        }

        <!-- pt-14 clears the FIXED NavBar (h-14). Without it the top of every
             page renders underneath the bar. A bare page has no NavBar, so it
             needs no offset. -->
        <main
          hx-boost="true"
          id="main-content"
          class="relative flex-grow w-full ${props.meta.bare ? "" : "pt-14"}"
        >
          ${props.children}
        </main>
        <div id="modal-container"></div>

        <app-toaster></app-toaster>

        <footer class="mt-16">
          <div class="retro-stripes h-[9px]" aria-hidden="true"></div>
          <div
            class="flex flex-col items-center justify-between gap-2 px-4 py-6 md:h-24 md:flex-row md:px-8 md:py-0"
          >
            <p class="font-display text-xs tracking-wide text-foreground">${props.app.name}</p>
            <p class="text-center text-sm leading-loose text-muted-foreground md:text-right">
              ${props.app.tagline || props.app.name}
            </p>
          </div>
        </footer>
      </body>
    </html>
  `;
};
