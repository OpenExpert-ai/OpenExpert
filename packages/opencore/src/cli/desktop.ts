// SPDX-License-Identifier: MIT
// `opencore desktop` — start the local server (unless it is already running)
// and open the native OpenExpert window (the Tauri shell). This command owns
// the server lifecycle so it can stop the server when the window closes.
//
// The repository is located from the CLI installation itself (not the current
// directory), so `OpenExpert` works from anywhere.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  ensureStandaloneApp,
  findRepoRoot,
  packageRoot,
  packageVersion,
  secretsAsEnv,
} from "./lib.js";

function port(): string {
  return process.env["PORT"] || "3000";
}

function appUrl(): string {
  return `http://localhost:${port()}`;
}

async function isServerUp(timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(appUrl(), { signal: AbortSignal.timeout(timeoutMs) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 120_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/**
 * Find the source checkout, in order of confidence:
 *   1. OPENEXPERT_DESKTOP_REPO (baked by the installer),
 *   2. relative to the CLI installation (packages/opencore → repo root),
 *   3. walking up from the current directory.
 */
function resolveRepo(cwd: string): string | null {
  const fromEnv = process.env["OPENEXPERT_DESKTOP_REPO"];
  if (fromEnv) {
    const r = findRepoRoot(fromEnv);
    if (r) return r;
  }
  return findRepoRoot(packageRoot()) ?? findRepoRoot(cwd);
}

/** Newest modification time (ms) under a directory, or 0 if unreadable. */
function newestMtime(dir: string): number {
  let newest = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) newest = Math.max(newest, newestMtime(full));
      else if (entry.isFile()) newest = Math.max(newest, statSync(full).mtimeMs);
    }
  } catch {
    // ignore unreadable paths
  }
  return newest;
}

/** True when the production build exists and is not older than src/. */
function buildIsFresh(repo: string): boolean {
  const built = join(repo, ".output", "server", "index.mjs");
  if (!existsSync(built)) return false;
  try {
    return statSync(built).mtimeMs >= newestMtime(join(repo, "src"));
  } catch {
    return true;
  }
}

/** Start the local server, reusing the source checkout when available. */
async function spawnServer(cwd: string, env: NodeJS.ProcessEnv): Promise<ChildProcess | null> {
  const repo = resolveRepo(cwd);
  if (repo) {
    const built = join(repo, ".output", "server", "index.mjs");
    if (existsSync(built) && buildIsFresh(repo)) {
      return spawn(process.execPath, [built], {
        cwd: repo,
        env: { ...env, NODE_ENV: "production", PORT: port() },
        stdio: "inherit",
      });
    }
    console.log(
      existsSync(built)
        ? "La build está desactualizada; arrancando en modo desarrollo…"
        : "Arrancando el servidor en modo desarrollo (no hay build)…",
    );
    return spawn("npm", ["run", "dev"], { cwd: repo, env, stdio: "inherit" });
  }

  const app = await ensureStandaloneApp(packageVersion(), { log: (m) => console.log(`  ${m}`) });
  if (!app) return null;
  return spawn(process.execPath, [join(app, ".output", "server", "index.mjs")], {
    cwd: app,
    env: { ...env, NODE_ENV: "production", PORT: port() },
    stdio: "inherit",
  });
}

function findDesktopBinary(cwd: string): string | null {
  const fromEnv = process.env["OPENEXPERT_DESKTOP_BIN"];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates = [join(homedir(), ".local", "bin", "openexpert-desktop")];
  const repo = resolveRepo(cwd);
  if (repo) {
    candidates.push(
      join(repo, "src-tauri", "target", "release", "openexpert-desktop"),
      join(repo, "src-tauri", "target", "debug", "openexpert-desktop"),
    );
  }
  return candidates.find((c) => existsSync(c)) ?? null;
}

export async function cmdDesktop(cwd = process.cwd()): Promise<number> {
  const env = { ...process.env, ...secretsAsEnv(cwd) } as NodeJS.ProcessEnv;

  const bin = findDesktopBinary(cwd);
  if (!bin) {
    console.error(
      "No se encontró la ventana de escritorio (openexpert-desktop).\n" +
        "Compílala con `npx tauri build` o usa `npm run desktop:install`.",
    );
    return 1;
  }

  let server: ChildProcess | null = null;
  let startedServer = false;

  if (await isServerUp()) {
    console.log(`• Usando el servidor ya activo en ${appUrl()}`);
  } else {
    console.log("Arrancando el servidor local…");
    server = await spawnServer(cwd, env);
    if (!server) {
      console.error(
        "No se pudo arrancar el servidor.\n" +
          "Si usas el código fuente, entra en el repositorio y ejecuta:\n" +
          "  npm ci && npm run build && npm run desktop:install",
      );
      return 1;
    }
    startedServer = true;
    if (!(await waitForServer())) {
      console.error("El servidor no respondió a tiempo.");
      server.kill("SIGTERM");
      return 1;
    }
  }

  const stopServer = (): void => {
    if (startedServer && server && !server.killed) {
      try {
        server.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
  };

  const onSignal = (): void => {
    stopServer();
    process.exit(0);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  console.log("Abriendo la ventana de OpenExpert…");
  const code = await new Promise<number>((resolve) => {
    const win = spawn(bin, [], { stdio: "inherit", env });
    win.on("exit", (c) => resolve(c ?? 0));
  });

  stopServer();
  return code;
}
