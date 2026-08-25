import path from "path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import devServer from "@hono/vite-dev-server";
import adapter from "@hono/vite-dev-server/cloudflare";
import build from "@hono/vite-build/node";

export default defineConfig(({ mode }) => {
  // 1. UPDATE ALIASES: Ensure Vite knows about @components
  const aliases = {
    "@server": path.resolve(__dirname, "./worker"),
    "@components": path.resolve(__dirname, "./worker/components"), // Add this
    "@views": path.resolve(__dirname, "./worker/views"),
  };

  // ------------------------------
  // CLIENT BUILD
  // ------------------------------
  if (mode === "client") {
    return {
      resolve: { alias: aliases },
      plugins: [tailwindcss()],
      esbuild: {
        jsxImportSource: "hono/jsx/dom",
      },
      build: {
        outDir: "dist/client",
        rollupOptions: {
          // 2. CRITICAL FIX: Point to the new location of main.ts
          input: "./worker/components/main.ts",
          output: {
            entryFileNames: "static/client.js",
            assetFileNames: "static/[name].[ext]",
          },
        },
      },
    };
  }

  // ------------------------------
  // SERVER BUILD
  // ------------------------------
  return {
    resolve: { alias: aliases },
    esbuild: {
      jsxImportSource: "hono/jsx",
    },
    build: {
      outDir: "dist/server",
      emptyOutDir: true,
    },
    plugins: [
      build({
        entry: "worker/index.ts",
      }),
      devServer({
        adapter,
        entry: "worker/index.ts",
        // 3. EXCLUDE: Ensure Hono ignores your client-side source files
        exclude: [
          /^\/@.+$/,
          /^\/node_modules\/.*/,
          /^\/static\/.*/,
          /^\/favicon\.ico$/,
          /.*\.ts($|\?)/,
          /.*\.tsx($|\?)/,
          /.*\.css($|\?)/,
          /.*\.png($|\?)/,
          /.*\.jpg($|\?)/,
          /.*\.svg($|\?)/,
        ],
      }),
      tailwindcss(),
    ],
  };
});
