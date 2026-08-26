import { html } from "hono/html";
import type { FC, Child } from "hono/jsx";
import { type PropsUser } from "@server/schema/auth.schema";
import type { AppConfig } from "@server/config/app.config";
import type { ResolvedMeta } from "@server/lib/seo";
import { NavBar } from "./components/NavBar";

interface LayoutProps {
  meta: ResolvedMeta;
  children?: Child;
  app: AppConfig;
  user?: PropsUser | null;
  currentPath?: string;
  headExtra?: Child;
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
                <meta name="twitter:card" content="summary_large_image" />`
            : html`<meta name="twitter:card" content="summary" />`
        }

        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        ${
          isProd
            ? html`<link rel="stylesheet" href="/static/main.css" />`
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

        ${NavBar({
          appName: props.app.name,
          user: props.user,
          currentPath: props.currentPath,
        })}

        <main hx-boost="true" id="main-content" class="relative flex-grow w-full">
          ${props.children}
        </main>
        <div id="modal-container"></div>

        <app-toaster></app-toaster>

        <footer class="py-6 md:px-8 md:py-0">
          <div class="flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
            <p class="text-center text-sm leading-loose text-muted-foreground md:text-left">
              ${props.app.tagline || props.app.name}
            </p>
          </div>
        </footer>
      </body>
    </html>
  `;
};
