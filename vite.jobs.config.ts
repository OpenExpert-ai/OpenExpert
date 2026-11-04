// SPDX-License-Identifier: MIT
import path from "node:path";
import { defineConfig } from "vite";

// Second, headless bundle: the scheduled-task runner in `src/jobs/main.ts`.
// It shares `src/lib` with the server, so it is built with the same Vite
// pipeline (which understands the `?raw` imports and `import.meta.glob` that
// db.server.ts needs) instead of a second toolchain. Dependencies stay
// external: they are resolved from node_modules at runtime, exactly like the
// server bundle.
export default defineConfig({
  // Nothing from public/ belongs in a Node bundle.
  publicDir: false,
  resolve: {
    tsconfigPaths: true,
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  build: {
    ssr: "src/jobs/main.ts",
    outDir: ".output/jobs",
    emptyOutDir: true,
    copyPublicDir: false,
    target: "node24",
    minify: false,
    rollupOptions: { output: { entryFileNames: "index.mjs" } },
  },
});
