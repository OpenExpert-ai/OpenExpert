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
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
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
