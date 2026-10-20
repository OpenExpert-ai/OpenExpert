#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Keep the desktop shell's version in step with the product's.
//
// There is one number to bump: `packages/openexpert/package.json` (see
// docs/en/adr/0007-one-name-one-version.md). The Rust side cannot read a JSON
// manifest, so the shell carries a copy in three files and this script is what
// writes it:
//
//   src-tauri/tauri.conf.json   version it bundles and names the packages after
//   src-tauri/Cargo.toml        version of the crate Tauri compiles
//   src-tauri/Cargo.lock        the crate's locked version
//
// Usage:
//   node scripts/sync-desktop-version.mjs           # write the three copies
//   node scripts/sync-desktop-version.mjs --check   # fail if they diverge
//
// `npm run version-packages` runs it after `changeset version`, so the release
// pull request already carries the synced files, and the desktop gate workflow
// runs it with --check.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const PATHS = {
  manifest: join(repo, "packages", "openexpert", "package.json"),
  tauri: join(repo, "src-tauri", "tauri.conf.json"),
  cargo: join(repo, "src-tauri", "Cargo.toml"),
  lock: join(repo, "src-tauri", "Cargo.lock"),
};

function fail(message) {
  console.error(`sync-desktop-version: ${message}`);
  process.exit(1);
}

function productVersion() {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(PATHS.manifest, "utf8"));
  } catch (error) {
    fail(`cannot read ${PATHS.manifest}: ${error.message}`);
  }
  if (typeof pkg.version !== "string" || !pkg.version) {
    fail(`${PATHS.manifest} has no version`);
  }
  return pkg.version;
}

/** The crate's `version` line, inside `[package]` only. */
function cargoVersion(text) {
  let section = "";
  for (const line of text.split("\n")) {
    const header = /^\[(.+)\]$/.exec(line.trim());
    if (header) {
      section = header[1];
      continue;
    }
    const match = /^version\s*=\s*"([^"]*)"/.exec(line);
    if (match && section === "package") return match[1];
  }
  return null;
}

function setCargoVersion(text, version) {
  const lines = text.split("\n");
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const header = /^\[(.+)\]$/.exec(lines[i].trim());
    if (header) {
      section = header[1];
      continue;
    }
    if (section === "package" && /^version\s*=\s*"/.test(lines[i])) {
      lines[i] = `version = "${version}"`;
      return lines.join("\n");
    }
  }
  return null;
}

/** The locked version of the shell crate. */
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

function setLockVersion(text, version) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== 'name = "openexpert-desktop"') continue;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      if (/^version\s*=\s*"/.test(lines[j])) {
        lines[j] = `version = "${version}"`;
        return lines.join("\n");
      }
    }
  }
  return null;
}

const version = productVersion();
const problems = [];
const written = [];

// tauri.conf.json is JSON: parse and re-serialise so the file stays valid even
// if the value was edited by hand.
const tauriText = readFileSync(PATHS.tauri, "utf8");
let tauri;
try {
  tauri = JSON.parse(tauriText);
} catch (error) {
  fail(`cannot parse ${PATHS.tauri}: ${error.message}`);
}
if (tauri.version !== version) {
  problems.push(`${PATHS.tauri}: ${tauri.version ?? "(none)"} != ${version}`);
  if (!check) {
    tauri.version = version;
    writeFileSync(PATHS.tauri, `${JSON.stringify(tauri, null, 2)}\n`);
    written.push("src-tauri/tauri.conf.json");
  }
}

const cargoText = readFileSync(PATHS.cargo, "utf8");
const currentCargo = cargoVersion(cargoText);
if (currentCargo !== version) {
  problems.push(`${PATHS.cargo}: ${currentCargo ?? "(none)"} != ${version}`);
  const updated = setCargoVersion(cargoText, version);
  if (!check && updated) {
    writeFileSync(PATHS.cargo, updated);
    written.push("src-tauri/Cargo.toml");
  }
}

const lockText = readFileSync(PATHS.lock, "utf8");
const currentLock = lockVersion(lockText);
if (currentLock !== version) {
  problems.push(`${PATHS.lock} (openexpert-desktop): ${currentLock ?? "(none)"} != ${version}`);
  const updated = setLockVersion(lockText, version);
  if (!check && updated) {
    writeFileSync(PATHS.lock, updated);
    written.push("src-tauri/Cargo.lock (openexpert-desktop)");
  }
}

if (problems.length === 0) {
  console.log(`sync-desktop-version: the desktop shell is at ${version} everywhere.`);
  process.exit(0);
}

if (check) {
  console.error(`sync-desktop-version: the desktop shell is not at ${version}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nFix with: npm run desktop:sync-version");
  process.exit(1);
}

console.log(`sync-desktop-version: wrote ${version} to ${written.length} file(s):`);
for (const label of written) console.log(`  · ${label}`);
