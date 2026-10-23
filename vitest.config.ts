// SPDX-License-Identifier: MIT
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // The gate command is `npx vitest run`, and it has to run every test of the
    // repo: the 14 files of `packages/openexpert/test` (config loader, provider
    // catalogue, local server, CLI) used to be reached only by `npm test`, whose
    // workspace chain appended them. A broken config loader could ship green
    // because the gate never loaded it. src/puertas-cobertura.test.ts keeps this
    // list and the files on disk in agreement.
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "packages/*/test/**/*.test.ts",
      "packages/*/test/**/*.test.tsx",
    ],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
      // `src/lib/engine/**` used to be excluded, so the AES-256-GCM custody of
      // the OAuth tokens (`local-secrets.server.ts`) was never measured. It is
      // in scope now that it has its own tests.
      exclude: ["src/lib/**/*.d.ts"],
      thresholds: {
        statements: 64,
        branches: 56,
        functions: 65,
        lines: 65,
      },
    },
  },
});
