#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Remove the per-user OpenExpert desktop launcher installed by
// scripts/install-desktop.mjs.

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();
const files = [
  join(home, ".local", "bin", "openexpert-desktop"),
  join(home, ".local", "bin", "OpenExpert"),
  join(home, ".local", "share", "applications", "openexpert.desktop"),
  join(home, ".local", "share", "icons", "hicolor", "512x512", "apps", "openexpert.png"),
];

let removed = 0;
for (const f of files) {
  if (existsSync(f)) {
    rmSync(f, { force: true });
    console.log(`✓ removed ${f}`);
    removed++;
  }
}

const appsDir = join(home, ".local", "share", "applications");
const hicolorDir = join(home, ".local", "share", "icons", "hicolor");
for (const [cmd, args] of [
  ["update-desktop-database", [appsDir]],
  ["gtk-update-icon-cache", ["-f", "-t", hicolorDir]],
]) {
  const r = spawnSync(cmd, args, { stdio: "ignore" });
  if (r.error) console.log(`  (skipped: ${cmd} not available)`);
}

console.log(removed ? "\n✓ OpenExpert desktop launcher removed." : "\nNothing to remove.");
