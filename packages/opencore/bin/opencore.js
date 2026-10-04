#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// OpenCore CLI.
//
// Usage:
//   node packages/opencore/bin/opencore.js doctor   check your local setup
//   node packages/opencore/bin/opencore.js serve    boot the local edition
//   npx @openexpert/opencore doctor
//   npx @openexpert/opencore serve
//
// `serve` actually boots the local application: it spawns `npm run dev` from
// the workspace root with OPENEXPERT_MODE=local so the existing build
// pipeline (Vite + TanStack Start + Nitro node-server) does the work. In a
// published installation (no Vite/TanStack available), it points users at
// the Docker image instead.

import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const cmd = process.argv[2] || "help";

function envPresent(name) {
  return Boolean(process.env[name] && process.env[name].trim());
}

function readJsonIfExists(p) {
  try {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  } catch {}
  return null;
}

/**
 * Find the OpenExpert workspace root: the directory that contains both
 * `package.json` and `packages/opencore/`. Falls back to the current
 * working directory when running outside a clone.
 */
function findRepoRoot(start) {
  let dir = resolve(start);
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "packages", "opencore"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const repoRoot = findRepoRoot(process.cwd());

if (cmd === "doctor") {
  const mode = process.env["OPENEXPERT_MODE"] || "cloud";
  const provider = process.env["OPENEXPERT_MODEL_PROVIDER"] || "google";
  const cfg = readJsonIfExists(join(repoRoot, "openexpert.json"));
  console.log(`OpenCore doctor
  repo root: ${repoRoot}
  mode: ${mode}${cfg ? " (openexpert.json found)" : " (no openexpert.json, using defaults)"}
  provider: ${provider}`);

  const problems = [];
  if (mode === "local") {
    if (provider === "google" && !envPresent("GOOGLE_API_KEY")) {
      problems.push("Missing GOOGLE_API_KEY (or set OPENEXPERT_MODEL_PROVIDER=ollama).");
    }
    if (provider === "openai-compatible" && !envPresent("OPENEXPERT_MODEL_KEY")) {
      problems.push("Missing OPENEXPERT_MODEL_KEY.");
    }
    if (provider === "openexpert") {
      if (!envPresent("OPENEXPERT_GATEWAY_URL")) {
        problems.push("Missing OPENEXPERT_GATEWAY_URL for the OpenExpert gateway.");
      }
      if (!envPresent("OPENEXPERT_API_KEY")) {
        problems.push("Missing OPENEXPERT_API_KEY for the OpenExpert gateway.");
      }
    }
    if (provider === "ollama") {
      console.log(`  ollama: ${process.env["OLLAMA_BASE_URL"] || "http://localhost:11434"}`);
    }
    if (!envPresent("GOOGLE_CLIENT_ID") || !envPresent("GOOGLE_CLIENT_SECRET")) {
      console.log(
        "  note: without GOOGLE_CLIENT_ID/SECRET the chat works but Drive stays disconnected.",
      );
    }
  } else {
    for (const k of [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GOOGLE_API_KEY",
    ]) {
      if (!envPresent(k)) problems.push(`Missing ${k} (see .env.example).`);
    }
  }
  if (!problems.length) {
    console.log("  OK: ready to start.");
    process.exit(0);
  }
  console.log("  pending:");
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
} else if (cmd === "serve") {
  const inClone = existsSync(join(repoRoot, "vite.config.ts"));
  if (!inClone) {
    console.log(
      "This is not an OpenExpert checkout. Use the Docker image instead:\n" +
        "  docker run --rm -p 3000:3000 -v openexpert-data:/data \\\n" +
        "    ghcr.io/openexpert/openexpert:latest\n" +
        "Or, in your own app, depend on @openexpert/opencore for the model\n" +
        "and storage abstractions.",
    );
    process.exit(1);
  }
  const child = spawn("npm", ["run", "dev"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, OPENEXPERT_MODE: "local" },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
} else if (cmd === "version" || cmd === "--version" || cmd === "-v") {
  const pkgPath = new URL("../package.json", import.meta.url);
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    console.log(`${pkg.name} ${pkg.version}`);
  } catch {
    console.log("@openexpert/opencore (unknown version)");
  }
} else {
  console.log(`opencore — open engine of OpenExpert

Usage:
  opencore doctor   check your local setup
  opencore serve    boot the local edition (http://localhost:3000)
  opencore version  print version

Quick start:
  cp openexpert.json.example openexpert.json
  opencore serve`);
}
