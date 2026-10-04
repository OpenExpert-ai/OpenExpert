#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Verifies that every relative link in the Markdown documentation resolves:
// both the target file and, when present, the heading anchor. Exits non-zero
// on the first broken link. Safe outside a git repository (skips).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function isGitRepo() {
  const r = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() === "true";
}

if (!isGitRepo()) {
  console.log("check-docs: not a git repository, skipping.");
  process.exit(0);
}

const files = spawnSync("git", ["ls-files"], { encoding: "utf8" })
  .stdout.split("\n")
  .filter((f) => f.endsWith(".md"));

function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const headingCache = new Map();
function headings(file) {
  if (!headingCache.has(file)) {
    const set = new Set();
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^#{1,6}\s+(.*)$/.exec(line);
      if (m) set.add(slug(m[1]));
    }
    headingCache.set(file, set);
  }
  return headingCache.get(file);
}

const broken = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  const re = /\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[1].trim().split(/\s+/)[0];
    if (raw.startsWith("http") || raw.startsWith("mailto:") || raw.startsWith("#")) continue;
    const [path, anchor] = raw.split("#");
    const target = path ? resolve(dirname(file), path) : file;
    if (path && !existsSync(target)) {
      broken.push(`${file} -> ${raw} (missing file)`);
      continue;
    }
    if (anchor && !headings(target).has(anchor)) {
      broken.push(`${file} -> ${raw} (missing anchor)`);
    }
  }
}

if (broken.length) {
  console.error(`check-docs: ${broken.length} broken link(s):`);
  for (const b of broken) console.error("  " + b);
  process.exit(1);
}
console.log(`check-docs: ${files.length} markdown files, all links resolve.`);
