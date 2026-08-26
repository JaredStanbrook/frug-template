import { html } from "hono/html";
import type { FC, Child } from "hono/jsx";
import { type PropsUser } from "@server/schema/auth.schema";
import type { AppConfig } from "@server/config/app.config";
import { NavBar } from "./components/NavBar";

interface LayoutProps {
  title?: string;
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
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${props.title}</title>
        ${props.app.tagline ? html`<meta name="description" content="${props.app.tagline}" />` : ""}
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
