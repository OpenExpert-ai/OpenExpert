// SPDX-License-Identifier: MIT
// Build configuration for @openexpert/opencore. Emits ESM + .d.ts and keeps
// the JS entry points tree-shakeable.

import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    config: "src/config.ts",
    "model-provider": "src/model-provider.ts",
    storage: "src/storage.ts",
    secrets: "src/secrets.ts",
    tools: "src/tools.ts",
    cli: "src/cli.ts",
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
