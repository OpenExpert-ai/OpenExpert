#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Install (or verify) the OpenExpert desktop launcher for the current user
// (no sudo). This script is the only place that knows how the installed pieces
// fit together: `install.sh` calls it instead of generating its own copies.
//
//   ~/.local/bin/openexpert-desktop                 Tauri window binary
//   ~/.local/bin/openexpert                         launcher (server + window)
//   ~/.local/share/applications/openexpert.desktop  application-menu entry
//   ~/.local/share/icons/hicolor/512x512/apps/openexpert.png
//
// Usage:
//   node scripts/install-desktop.mjs               build, install and verify
//   node scripts/install-desktop.mjs --skip-build  install what is already built
//   node scripts/install-desktop.mjs --check       verify only; non-zero if the
//                                                  installed launcher is dead

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = homedir();
const binDir = join(home, ".local", "bin");
const appsDir = join(home, ".local", "share", "applications");
const hicolorDir = join(home, ".local", "share", "icons", "hicolor");
const iconDir = join(hicolorDir, "512x512", "apps");
const launcher = join(binDir, "openexpert");
const installedBinary = join(binDir, "openexpert-desktop");
const installedDesktopFile = join(appsDir, "openexpert.desktop");
const installedIcon = join(iconDir, "openexpert.png");
const cliEntry = join(repo, "packages", "openexpert", "bin", "openexpert.js");
const skipBuild = process.argv.includes("--skip-build");
const checkOnly = process.argv.includes("--check");

/** Quote a value for a double-quoted bash string. */
function bashQuote(value) {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: repo, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

/**
 * Replace a file atomically (write a sibling temp file, then rename over the
 * target). Overwriting in place fails with ETXTBSY on Linux when the target is
 * the running desktop binary or launcher, so re-installing while OpenExpert is
 * open must go through a rename.
 */
function replace(path, mode, write) {
  const tmp = `${path}.new-${process.pid}`;
  write(tmp);
  chmodSync(tmp, mode);
  renameSync(tmp, path);
}

/** Width and height from a PNG's IHDR, or null if the file is not a PNG. */
function pngSize(path) {
  try {
    const header = readFileSync(path).subarray(0, 24);
    if (header.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } catch {
    return null;
  }
}

/** The node binary and CLI entry the launcher hands to `exec`. */
function execTargets(text) {
  const targets = [];
  for (const line of text.split("\n")) {
    const match = /^exec\s+"([^"]+)"\s+"([^"]+)"/.exec(line.trim());
    if (match) targets.push(match[1], match[2]);
  }
  return targets;
}

/**
 * Why an already-installed launcher would not work, if it would not. This is the
 * check that was missing when the pre-rename launcher
 * (`packages/opencore/bin/opencore.js`) stayed in the menu pointing at a file
 * that no longer existed.
 */
function launcherProblems() {
  if (!existsSync(launcher)) return [`${launcher} does not exist`];
  const problems = [];
  const text = readFileSync(launcher, "utf8");
  const syntax = spawnSync("bash", ["-n", launcher], { encoding: "utf8" });
  if (syntax.error) {
    problems.push(`cannot run bash -n on the launcher (${syntax.error.message})`);
  } else if (syntax.status !== 0) {
    problems.push(`the launcher is not valid bash: ${(syntax.stderr || "").trim()}`);
  }
  if (text.includes("packages/opencore") || text.includes("/opencore.js")) {
    problems.push(
      "the launcher runs the pre-rename package (packages/opencore), which no longer exists",
    );
  }
  const targets = execTargets(text);
  if (targets.length < 2) {
    problems.push("the launcher has no `exec <node> <cli>` line this installer can read");
  }
  for (const target of targets) {
    if (!existsSync(target)) problems.push(`the launcher runs ${target}, which does not exist`);
  }
  return problems;
}

function desktopEntryProblems() {
  if (!existsSync(installedDesktopFile)) return [`${installedDesktopFile} does not exist`];
  const problems = [];
  const text = readFileSync(installedDesktopFile, "utf8");
  const exec = /^Exec=(.*)$/m.exec(text);
  const tryExec = text.match(/^TryExec=/gm) ?? [];
  if (!exec) problems.push("the menu entry has no Exec= line");
  else if (!existsSync(exec[1].split(/\s+/)[0])) {
    problems.push(`Exec= points at ${exec[1]}, which does not exist`);
  }
  if (tryExec.length > 1)
    problems.push(`the menu entry has ${tryExec.length} TryExec= lines (invalid)`);
  const tryLine = /^TryExec=(.*)$/m.exec(text);
  if (!tryLine) problems.push("the menu entry has no TryExec= line");
  else if (!existsSync(tryLine[1]))
    problems.push(`TryExec= points at ${tryLine[1]}, which does not exist`);
  const validate = spawnSync("desktop-file-validate", [installedDesktopFile], { encoding: "utf8" });
  if (!validate.error && validate.status !== 0) {
    problems.push(
      `desktop-file-validate rejects the menu entry: ${(validate.stdout || "").trim()}`,
    );
  }
  return problems;
}

function iconProblems() {
  if (!existsSync(installedIcon)) return [`${installedIcon} does not exist`];
  const size = pngSize(installedIcon);
  if (!size) return [`${installedIcon} is not a PNG`];
  if (size.width !== 512 || size.height !== 512) {
    // The desktop reads the directory name as the size; a 1024 file in the
    // 512 slot is indexed as 512 and gets scaled twice.
    return [`${installedIcon} is ${size.width}x${size.height}, the desktop expects 512x512`];
  }
  return [];
}

/** Print the result of every installed piece; returns true when all are sound. */
function verify() {
  const groups = [
    { label: `launcher ${launcher}`, problems: launcherProblems() },
    {
      label: `window ${installedBinary}`,
      problems: !existsSync(installedBinary)
        ? [`${installedBinary} does not exist`]
        : (statSync(installedBinary).mode & 0o111) === 0
          ? [`${installedBinary} is not executable`]
          : [],
    },
    { label: `menu entry ${installedDesktopFile}`, problems: desktopEntryProblems() },
    { label: `icon ${installedIcon}`, problems: iconProblems() },
  ];

  let ok = true;
  for (const { label, problems } of groups) {
    if (problems.length === 0) {
      console.log(`  ✓ ${label}`);
      continue;
    }
    ok = false;
    for (const problem of problems) console.error(`  ✗ ${problem}`);
  }

  if (existsSync(join(repo, "packages", "openexpert", "dist", "cli.js"))) return ok;
  console.log(
    "  · the CLI is not built yet: run `npm run build --workspace @openexpert/openexpert`",
  );
  return ok;
}

if (checkOnly) {
  const ok = verify();
  process.exit(ok ? 0 : 1);
}

function build() {
  console.log("· Building the OpenExpert CLI…");
  sh("npm", ["run", "build", "--workspace", "@openexpert/openexpert"]);
  console.log("· Building the web app…");
  sh("npm", ["run", "build"]);
  console.log("· Building the desktop window (Rust)…");
  // The local CLI, not `npx tauri`: with an incomplete node_modules npx answers
  // "could not determine executable to run" and hides the real cause.
  const tauriBin = join(repo, "node_modules", ".bin", "tauri");
  if (!existsSync(tauriBin)) {
    console.error(
      `Missing the Tauri CLI at ${tauriBin}.\n` +
        "node_modules looks incomplete: run `npm ci` and try again.",
    );
    process.exit(1);
  }
  // The desktop package carries the product's version, read from the one place
  // that has it (the package manifest) instead of a second number copied into
  // `tauri.conf.json` that would drift. `npm run desktop:sync-version` writes
  // the copies; this override keeps the binary right even if one is stale.
  const productVersion = JSON.parse(
    readFileSync(join(repo, "packages", "openexpert", "package.json"), "utf8"),
  ).version;
  sh(tauriBin, ["build", "--config", JSON.stringify({ version: productVersion })]);
}

if (!skipBuild) build();

const binary = [
  join(repo, "src-tauri", "target", "release", "openexpert-desktop"),
  join(repo, "src-tauri", "target", "release", "OpenExpert"),
].find((p) => existsSync(p));

if (!binary) {
  console.error("No desktop binary found. Build the window first (drop --skip-build).");
  process.exit(1);
}

mkdirSync(binDir, { recursive: true });
mkdirSync(appsDir, { recursive: true });
mkdirSync(iconDir, { recursive: true });

// A launcher from an older install may still be sitting there, dead. Say so
// instead of silently overwriting it: that is the only trace the user gets that
// the menu entry had stopped working.
if (existsSync(launcher)) {
  const stale = launcherProblems();
  if (stale.length > 0) {
    console.log(`· Replacing a launcher that no longer works (${launcher}):`);
    for (const problem of stale) console.log(`    ${problem}`);
  }
  const repoLine = /^export OPENEXPERT_DESKTOP_REPO="([^"]*)"/m.exec(
    readFileSync(launcher, "utf8"),
  );
  if (repoLine && repoLine[1] !== repo) {
    console.log(`· It pointed at another checkout (${repoLine[1]}); this one is ${repo}.`);
  }
}

replace(installedBinary, 0o755, (tmp) => copyFileSync(binary, tmp));

// Launcher: start the server and open the native window. Uses absolute paths
// (node + repo) so it works from a desktop launcher (rofi/wofi/fuzzel) whose
// PATH may not include ~/.local/bin. Logs to ~/.openexpert/desktop.log when not
// attached to a terminal.
const nodeBin = process.execPath;
const logFile = join(home, ".openexpert", "desktop.log");
replace(launcher, 0o755, (tmp) =>
  writeFileSync(
    tmp,
    `#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Generated by scripts/install-desktop.mjs — reinstall instead of editing.
export OPENEXPERT_DESKTOP_REPO=${bashQuote(repo)}
mkdir -p "$HOME/.openexpert" 2>/dev/null || true
cd ${bashQuote(repo)} 2>/dev/null || true

# With no argument (the menu entry, or \`openexpert\` on its own) the launcher
# opens the window. Any other subcommand — doctor, fix, init, serve, version… —
# runs as given: a diagnosis command must not start a graphical interface.
if [ "$#" -eq 0 ]; then
  set -- desktop
fi
case "$1" in
  desktop|app)
    if [ -t 1 ]; then
      exec ${bashQuote(nodeBin)} ${bashQuote(cliEntry)} "$@"
    else
      exec ${bashQuote(nodeBin)} ${bashQuote(cliEntry)} "$@" >>"${logFile}" 2>&1
    fi
    ;;
  *)
    exec ${bashQuote(nodeBin)} ${bashQuote(cliEntry)} "$@"
    ;;
esac
`,
  ),
);

// Remove the previous capitalised launcher, if any.
const legacyLauncher = join(binDir, "OpenExpert");
if (existsSync(legacyLauncher)) rmSync(legacyLauncher, { force: true });

// The desktop entry uses the absolute launcher path (Exec + TryExec) so the
// application menu does not depend on PATH. Exactly one TryExec: a second one is
// an invalid entry.
const sourceEntry = readFileSync(join(repo, "src-tauri", "OpenExpert.desktop"), "utf8");
const entryLines = sourceEntry.split("\n").filter((line) => !line.startsWith("TryExec="));
const execIndex = entryLines.findIndex((line) => line.startsWith("Exec="));
if (execIndex === -1) {
  console.error("src-tauri/OpenExpert.desktop has no Exec= line to point at the launcher.");
  process.exit(1);
}
entryLines[execIndex] = `Exec=${launcher}`;
entryLines.splice(execIndex + 1, 0, `TryExec=${launcher}`);
replace(installedDesktopFile, 0o644, (tmp) => writeFileSync(tmp, entryLines.join("\n")));

// The icon goes in hicolor/512x512, so it has to be 512 pixels: the theme reads
// the directory name as the size and scales anything else.
const iconSource = join(repo, "src-tauri", "icons", "icon.png");
if (!existsSync(iconSource)) {
  console.error(`Missing icon source: ${iconSource}`);
  process.exit(1);
}
const iconSize = pngSize(iconSource);
if (!iconSize || iconSize.width !== 512 || iconSize.height !== 512) {
  console.error(
    `${iconSource} is ${iconSize ? `${iconSize.width}x${iconSize.height}` : "not a PNG"}; ` +
      "the 512x512 icon slot needs a 512x512 PNG.",
  );
  process.exit(1);
}
replace(installedIcon, 0o644, (tmp) => copyFileSync(iconSource, tmp));

// Refresh desktop/icon caches (best effort; tools may be absent).
const refresh = [
  ["update-desktop-database", [appsDir]],
  ["gtk-update-icon-cache", ["-f", "-t", hicolorDir]],
];
for (const [cmd, args] of refresh) {
  const r = spawnSync(cmd, args, { stdio: "ignore" });
  if (r.error) console.log(`  (skipped: ${cmd} not available)`);
}

console.log("\n· Checking what was installed…");
if (!verify()) {
  console.error("\nThe installation does not add up (see the ✗ lines above).");
  process.exit(1);
}

console.log("\n✓ OpenExpert installed for the current user.");
console.log(`  Command:  openexpert            (no arguments: server + window)`);
console.log(`  Subcommands: openexpert doctor | fix | init | serve | version`);
console.log(`  Window:   ${installedBinary}`);
console.log(`  Launcher: ${installedDesktopFile}`);
