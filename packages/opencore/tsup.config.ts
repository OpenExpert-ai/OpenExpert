// SPDX-License-Identifier: MIT
// Build configuration for @openexpert/opencore. Emits ESM + .d.ts and keeps
// the JS entry points tree-shakeable.

import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    mode: "src/mode.ts",
    config: "src/config.ts",
    "model-provider": "src/model-provider.ts",
    gateway: "src/gateway.ts",
    storage: "src/storage.ts",
    secrets: "src/secrets.ts",
    auth: "src/auth.ts",
    tools: "src/tools.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  splitting: false,
  treeshake: true,
  platform: "neutral",
});
