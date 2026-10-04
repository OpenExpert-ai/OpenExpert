// SPDX-License-Identifier: MIT
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";

// This file is the entire build setup. Every plugin is declared explicitly, in
// order, so what runs is readable here instead of hidden in a wrapper package.
export default defineConfig(async ({ command, mode }) => {
  const plugins: PluginOption[] = [tailwindcss()];

  plugins.push(
    tanstackStart({
      // Nothing under src/**/server/ may end up in the browser bundle.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // Entry of the SSR bundle: src/server.ts wraps TanStack Start's handler
      // to turn swallowed errors into a real 500 with a readable page.
      server: { entry: "server" },
    }),
  );

  // Nitro produces the deployable server. Only needed on `build`; in dev the
  // Vite server handles the request itself. The app is local-first, so the
  // preset is always node-server.
  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({ preset: "node-server" }));
  }

  plugins.push(react());

  return {
    // `npm run build:dev` emits a development build: keep function names so the
    // stack traces point at the original code.
    ...(command === "build" && mode === "development"
      ? {
          environments: {
            client: { define: { "process.env.NODE_ENV": JSON.stringify("development") } },
          },
          esbuild: { keepNames: true },
        }
      : {}),
    resolve: {
      // The "@/*" alias comes from the `paths` block of tsconfig.json.
      tsconfigPaths: true,
      alias: { "@": path.resolve(import.meta.dirname, "src") },
      // Two copies of React (or of TanStack Query) in the same graph break
      // hooks and context at runtime.
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    server: {
      // Pinned so the OAuth redirect URI for Google Drive matches out of the
      // box; strictPort makes the server fail loudly instead of hopping ports.
      port: 3000,
      strictPort: true,
    },
    plugins,
  };
});
