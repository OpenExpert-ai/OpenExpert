#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Verifies that every tracked source file declares an SPDX license identifier
// compatible with the MIT license of the project. The check is advisory and
// exits non-zero only when the repository is a git repo and offenders are
// found. Outside a git repo (e.g. during fresh `npm install`) it exits 0.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ALLOWED = new Set([
  "MIT",
  "Apache-2.0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "MPL-2.0",
  "0BSD",
  "Unlicense",
]);

const EXCLUDE_TOP = new Set([
  "node_modules",
  "dist",
  ".output",
  ".tanstack",
  ".nitro",
  "public",
  ".obsidian",
  "docs",
]);

const SCAN = ["*.ts", "*.tsx", "*.js", "*.cjs", "*.mjs", "*.mts", "*.cts"];
const SPDX_RE = /SPDX-License-Identifier:\s*([^\s*]+)/;

function isGitRepo() {
  const r = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() === "true";
}

if (!isGitRepo()) {
  console.log("license-check: not a git repository, skipping.");
  process.exit(0);
}

const args = ["ls-files", ...SCAN.flatMap((p) => ["--", p])];
const ls = spawnSync("git", args, { encoding: "utf8" });
if (ls.status !== 0) {
  console.error("license-check: git ls-files failed");
  process.exit(2);
}

const files = ls.stdout.split("\n").filter(Boolean);
const offenders = [];

for (const file of files) {
  if (EXCLUDE_TOP.has(file.split("/")[0])) continue;
  if (/(^|\/)(.*\.)?(test|spec)\.[mc]?[jt]sx?$/.test(file)) continue;
  if (file.endsWith(".d.ts") || file.endsWith(".gen.ts")) continue;

  let head;
  try {
    head = readFileSync(file, "utf8").split("\n", 12).join("\n");
  } catch {
    continue;
  }
  const match = head.match(SPDX_RE);
  if (!match || !ALLOWED.has(match[1])) offenders.push(file);
}

if (offenders.length) {
  console.error("Files missing or with non-allowed SPDX-License-Identifier:");
  for (const f of offenders) console.error("  " + f);
  process.exit(1);
}

console.log(`license-check: ${files.length} files, all OK.`);
