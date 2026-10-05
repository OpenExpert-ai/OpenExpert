#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Thin launcher for the OpenCore CLI. The implementation lives in
// src/cli.ts and is compiled to dist/cli.js. If the package has not been
// built yet (source checkout), a clear instruction is printed.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist", "cli.js");

if (!existsSync(dist)) {
  console.error(
    "OpenExpert CLI is not built yet.\n" +
      "Run: npm run build --workspace @openexpert/opencore\n" +
      "(or use `npm run opencore:doctor` from the repository root).",
  );
  process.exit(1);
}

const mod = await import(dist);
await mod.run(process.argv.slice(2));
