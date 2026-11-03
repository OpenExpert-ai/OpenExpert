// SPDX-License-Identifier: MIT
// `openexpert desktop` — start the local server (unless it is already running)
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
  localServerEnv,
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

/**
 * Does this HTTP response come from the OpenExpert server? Every response
 * carries `x-request-id` (src/server.ts) and the security headers
 * (src/lib/http.server.ts). Any other app squatting the port (an unrelated
 * Express service, a dev server…) must NOT be reused: the window would show
 * that other app instead ("Cannot GET /").
 */
export function looksLikeOpenExpert(status: number, headers: Headers): boolean {
  return status < 500 && headers.has("x-request-id") && headers.has("x-frame-options");
}

type ServerProbe = { kind: "openexpert"; version: string | null } | { kind: "other" | "none" };

/** Classify whatever is listening on the app port (if anything). */
async function probeServer(timeoutMs = 1500): Promise<ServerProbe> {
  try {
    const res = await fetch(appUrl(), {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
    });
    return looksLikeOpenExpert(res.status, res.headers)
      ? { kind: "openexpert", version: res.headers.get("x-openexpert-version") }
      : { kind: "other" };
  } catch {
    return { kind: "none" };
  }
}

async function waitForServer(timeoutMs = 120_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await probeServer()).kind === "openexpert") return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/**
 * Find the source checkout, in order of confidence:
 *   1. OPENEXPERT_DESKTOP_REPO (baked by the installer),
 *   2. relative to the CLI installation (packages/openexpert → repo root),
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

// These inputs contribute to the web server or its static assets. Checking only
// src/ could serve an old schema, shared engine, public file or build config.
const BUILD_INPUTS = [
  "src",
  "drizzle",
  "public",
  "packages/openexpert/src",
  "packages/openexpert/schema",
  "packages/openexpert/package.json",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "tsconfig.json",
];

/** True when the production build exists and is not older than its inputs. */
function buildIsFresh(repo: string): boolean {
  const built = join(repo, ".output", "server", "index.mjs");
  if (!existsSync(built)) return false;
  try {
    const newestInput = Math.max(
      0,
      ...BUILD_INPUTS.map((input) => {
        const path = join(repo, input);
        try {
          const stat = statSync(path);
          return stat.isDirectory() ? newestMtime(path) : stat.mtimeMs;
        } catch {
          return 0;
        }
      }),
    );
    return statSync(built).mtimeMs >= newestInput;
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
        env: { ...env, ...localServerEnv(), NODE_ENV: "production", PORT: port() },
        stdio: "inherit",
      });
    }
    console.log(
      existsSync(built)
        ? "La build está desactualizada; arrancando en modo desarrollo…"
        : "Arrancando el servidor en modo desarrollo (no hay build)…",
    );
    return spawn("npm", ["run", "dev"], {
      cwd: repo,
      env: { ...env, ...localServerEnv() },
      stdio: "inherit",
    });
  }

  const app = await ensureStandaloneApp(packageVersion(), { log: (m) => console.log(`  ${m}`) });
  if (!app) return null;
  return spawn(process.execPath, [join(app, ".output", "server", "index.mjs")], {
    cwd: app,
    env: { ...env, ...localServerEnv(), NODE_ENV: "production", PORT: port() },
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

  const probe = await probeServer();
  if (probe.kind === "openexpert") {
    const expectedVersion = packageVersion();
    if (probe.version && expectedVersion !== "0.0.0" && probe.version !== expectedVersion) {
      console.error(
        `El servidor activo usa OpenExpert ${probe.version}, pero el lanzador usa ${expectedVersion}.\n` +
          `Cierra el servidor anterior y vuelve a abrir OpenExpert para usar la versión instalada.`,
      );
      return 1;
    }
    if (!probe.version) {
      console.warn(
        "El servidor activo no informa de su versión; no se puede comprobar si está actualizado.",
      );
    }
    console.log(`• Usando el servidor ya activo en ${appUrl()}`);
  } else if (probe.kind === "other") {
    console.error(
      `El puerto ${port()} está ocupado por otra aplicación, no por OpenExpert.\n` +
        `OpenExpert no arranca encima de otro programa. Mira quién lo ocupa y libéralo\n` +
        `(o elige otro puerto para OpenExpert con PORT):\n` +
        `  ss -ltnp | grep :${port()}     # o: lsof -i :${port()}\n` +
        `  PORT=3100 openexpert\n`,
    );
    return 1;
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
  // The port belongs to this command (it honours PORT), not to the window: the
  // shell loads OPENEXPERT_DESKTOP_URL instead of the address compiled into the
  // binary, so `PORT=3100 openexpert` opens 3100 and not 3000.
  const code = await new Promise<number>((resolve) => {
    const win = spawn(bin, [], {
      stdio: "inherit",
      env: { ...env, OPENEXPERT_DESKTOP_URL: appUrl() },
    });
    win.on("exit", (c) => resolve(c ?? 0));
  });

  stopServer();
  return code;
}
