#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// The desktop shell's configuration has no runtime to complain for it: a wrong
// number, an empty `bundle.targets`, an icon that does not exist or a window
// loaded from a port nobody serves all build without an error. This script is
// the check, and `.github/workflows/desktop-gate.yml` runs it in advisory mode.
//
// Blocks A (identity and versions), B (configuration) and C (assets) of the
// checklist in docs/en/08-deployment.md.
//
// Usage: node scripts/check-desktop-config.mjs   # exits 1 when something is off

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(repo, "src-tauri");
const configPath = join(tauriDir, "tauri.conf.json");

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function check(condition, okMessage, failMessage) {
  if (condition) console.log(`  ✓ ${okMessage}`);
  else fail(failMessage);
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    fail(`cannot read ${path}`);
    return "";
  }
}

function pngSize(path) {
  try {
    const header = readFileSync(path).subarray(0, 24);
    if (header.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } catch {
    return null;
  }
}

/** `version` inside `[package]` of a Cargo.toml. */
function cargoVersion(text, sectionWanted = "package") {
  let section = "";
  for (const line of text.split("\n")) {
    const header = /^\[(.+)\]$/.exec(line.trim());
    if (header) {
      section = header[1];
      continue;
    }
    const match = /^version\s*=\s*"([^"]*)"/.exec(line);
    if (match && section === sectionWanted) return match[1];
  }
  return null;
}

/** `version` of the shell crate in Cargo.lock. */
function lockVersion(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== 'name = "openexpert-desktop"') continue;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const match = /^version\s*=\s*"([^"]*)"/.exec(lines[j]);
      if (match) return match[1];
    }
  }
  return null;
}

// ── A. Identity and versions ────────────────────────────────────────────────
console.log("A · Identity and versions");
const product = JSON.parse(readText(join(repo, "packages", "openexpert", "package.json"))).version;
const config = JSON.parse(readText(configPath));
const cargo = readText(join(tauriDir, "Cargo.toml"));
const lock = readText(join(tauriDir, "Cargo.lock"));

check(
  config.version === product,
  `tauri.conf.json version ${product}`,
  `tauri.conf.json says ${config.version}, the product is ${product} (npm run desktop:sync-version)`,
);
check(
  cargoVersion(cargo) === product,
  `Cargo.toml version ${product}`,
  `Cargo.toml says ${cargoVersion(cargo)}, the product is ${product} (npm run desktop:sync-version)`,
);
check(
  lockVersion(lock) === product,
  `Cargo.lock version ${product}`,
  `Cargo.lock says ${lockVersion(lock)}, the product is ${product} (npm run desktop:sync-version)`,
);
const cargoName = /\[package\][\s\S]*?\nname\s*=\s*"([^"]+)"/.exec(cargo)?.[1];
check(
  config.mainBinaryName === cargoName,
  `mainBinaryName matches the crate (${cargoName})`,
  `mainBinaryName is ${config.mainBinaryName} but the crate is ${cargoName}`,
);

// ── B. Configuration ────────────────────────────────────────────────────────
console.log("B · Configuration");
const targets = config.bundle?.targets;
const KNOWN_TARGETS = new Set(["deb", "rpm", "appimage", "nsis", "msi", "app", "dmg", "updater"]);
const hasTargets =
  targets === "all" ||
  (Array.isArray(targets) && targets.length > 0) ||
  config.bundle?.active === false;
check(
  hasTargets,
  `bundle.targets is ${
    Array.isArray(targets) ? targets.join(", ") || "(empty)" : String(targets)
  } with active=${config.bundle?.active}`,
  `bundle.active is true but targets is ${
    Array.isArray(targets) ? "an empty list" : String(targets)
  }: the build finishes in green and publishes nothing`,
);
if (Array.isArray(targets)) {
  const unknown = targets.filter((target) => !KNOWN_TARGETS.has(target));
  check(
    unknown.length === 0,
    "every bundle target is one Tauri knows",
    `unknown bundle target(s): ${unknown.join(", ")}`,
  );
}

const windows = config.app?.windows ?? [];
const labels = windows.map((window) => window.label);
const capabilityFiles = existsSync(join(tauriDir, "capabilities"))
  ? readdirSync(join(tauriDir, "capabilities")).filter((name) => name.endsWith(".json"))
  : [];
const capabilities = capabilityFiles.map((name) => ({
  name,
  ...JSON.parse(readText(join(tauriDir, "capabilities", name))),
}));
const covered = new Set();
for (const capability of capabilities) {
  for (const label of capability.windows ?? []) {
    if (labels.includes(label) || label === "*") covered.add(label);
    else
      fail(
        `capability ${capability.name} targets window "${label}", which tauri.conf.json does not declare`,
      );
  }
  if (capability.remote) {
    fail(
      `capability ${capability.name} declares remote: the page served over HTTP would get the IPC API. ` +
        "The shell has no commands and no permissions beyond core:default.",
    );
  }
}
check(
  labels.every((label) => covered.has(label)),
  `every window has a capability (${labels.join(", ")})`,
  `window(s) without a capability: ${labels.filter((label) => !covered.has(label)).join(", ")}`,
);
if (config.app?.security?.csp == null) {
  notes.push(
    "csp is null: the window loads content over HTTP and the server sets the headers (src/lib/http.server.ts)",
  );
}

// ── C. Assets and frontend ──────────────────────────────────────────────────
console.log("C · Assets and frontend");
const icons = config.bundle?.icon ?? [];
let largest = 0;
for (const icon of icons) {
  const path = join(tauriDir, icon);
  if (!existsSync(path)) {
    fail(`bundle.icon lists ${icon}, which does not exist`);
    continue;
  }
  if (!icon.endsWith(".png")) continue;
  const size = pngSize(path);
  if (!size) {
    fail(`bundle.icon lists ${icon}, which is not a PNG`);
    continue;
  }
  if (size.width !== size.height)
    fail(`bundle.icon lists ${icon}, which is ${size.width}x${size.height}, not square`);
  largest = Math.max(largest, size.width);
}
check(
  largest >= 512,
  `the packaged icons reach ${largest}px`,
  `the largest packaged icon is ${largest}px; a dock at 512 would upscale it`,
);

const dist = resolve(tauriDir, config.build?.frontendDist ?? "");
check(
  existsSync(dist),
  `frontendDist exists (${config.build?.frontendDist})`,
  `frontendDist ${config.build?.frontendDist} does not exist: tauri build aborts with "Unable to find your web assets"`,
);
const windowUrls = windows.map((window) => window.url).filter((url) => /^https?:/.test(url ?? ""));
if (windowUrls.length > 0) {
  check(
    existsSync(join(dist, "index.html")),
    "frontendDist has an index.html for the case where the window cannot reach the server",
    `frontendDist has no index.html and the window loads ${windowUrls[0]} over HTTP: ` +
      "if the server is not there, the window is blank with no explanation",
  );
  notes.push(
    `the window loads ${windowUrls[0]} over HTTP, so the embedded assets are only a fallback: ` +
      "keep frontendDist pointed at src-tauri/fallback, not at the web build",
  );
}

const installIcon = join(tauriDir, "icons", "icon.png");
const installIconSize = pngSize(installIcon);
check(
  installIconSize?.width === 512 && installIconSize?.height === 512,
  "icons/icon.png is 512x512 (the launcher installs it in hicolor/512x512)",
  `icons/icon.png is ${installIconSize ? `${installIconSize.width}x${installIconSize.height}` : "missing"}; ` +
    "the per-user installer copies it into hicolor/512x512/apps",
);

// ── Summary ─────────────────────────────────────────────────────────────────
for (const note of notes) console.log(`  · ${note}`);
if (failures.length > 0) {
  console.error(`\ndesktop config: ${failures.length} problem(s):`);
  for (const problem of failures) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("\ndesktop config: A, B and C are consistent.");
