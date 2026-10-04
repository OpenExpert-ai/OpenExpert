// SPDX-License-Identifier: MIT
// Shared helpers for the OpenCore CLI: paths, config/secrets I/O, HTTP
// detection, and release download with checksum verification.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Provider = "google" | "ollama" | "openai-compatible" | "openexpert";

export type FileConfig = {
  mode?: "local" | "cloud";
  modelProvider?: Provider;
  modelId?: string;
  ollamaBaseUrl?: string;
  dataDir?: string;
};

export type Secrets = {
  GOOGLE_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OPENEXPERT_MODEL_KEY?: string;
  OPENEXPERT_BASE_URL?: string;
  OPENEXPERT_GATEWAY_URL?: string;
  OPENEXPERT_API_KEY?: string;
};

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_GATEWAY_URL = "https://gateway.openexpert.example/v1";
export const DEFAULT_DATA_DIR = "~/.openexpert";

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export function packageRoot(): string {
  // dist/cli.js -> package root is one level up.
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

export function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot(), "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Walk up from `start` to find a checkout (package.json + packages/opencore). */
export function findRepoRoot(start = process.cwd()): string | null {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    if (
      existsSync(join(dir, "package.json")) &&
      existsSync(join(dir, "packages", "opencore")) &&
      existsSync(join(dir, "vite.config.ts"))
    ) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function configPath(cwd = process.cwd()): string {
  return join(cwd, "openexpert.json");
}

export function readConfig(cwd = process.cwd()): FileConfig {
  try {
    const p = configPath(cwd);
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, "utf8")) as FileConfig;
  } catch {
    return {};
  }
}

export function writeConfig(cfg: FileConfig, cwd = process.cwd()): void {
  writeFileSync(configPath(cwd), JSON.stringify(cfg, null, 2) + "\n");
}

export function resolvedDataDir(cwd = process.cwd()): string {
  const cfg = readConfig(cwd);
  const raw = process.env["OPENEXPERT_DATA_DIR"] || cfg.dataDir || DEFAULT_DATA_DIR;
  return expandHome(raw);
}

export function secretsPath(cwd = process.cwd()): string {
  return join(resolvedDataDir(cwd), "secrets.json");
}

export function readSecrets(cwd = process.cwd()): Secrets {
  try {
    const p = secretsPath(cwd);
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, "utf8")) as Secrets;
  } catch {
    return {};
  }
}

export function writeSecrets(secrets: Secrets, cwd = process.cwd()): string {
  const dir = resolvedDataDir(cwd);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, "secrets.json");
  writeFileSync(p, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  return p;
}

/** Merge stored secrets into the current environment for the child server. */
export function secretsAsEnv(cwd = process.cwd()): Record<string, string> {
  const s = readSecrets(cwd);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(s)) if (v) out[k] = v;
  return out;
}

export async function httpGetJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: opts.headers,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 2500),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function detectOllama(
  baseUrl = DEFAULT_OLLAMA_URL,
  timeoutMs = 1500,
): Promise<{ up: boolean; models: string[] }> {
  const data = await httpGetJson<{ models?: { name: string }[] }>(`${baseUrl}/api/tags`, {
    timeoutMs,
  });
  if (!data) return { up: false, models: [] };
  return { up: true, models: (data.models ?? []).map((m) => m.name) };
}

export async function listGatewayModels(baseURL: string, apiKey: string): Promise<string[] | null> {
  const data = await httpGetJson<{ data?: { id: string }[] }>(
    `${baseURL.replace(/\/+$/, "")}/models`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeoutMs: 3000,
    },
  );
  if (!data) return null;
  return (data.data ?? []).map((m) => m.id);
}

export function appCacheDir(version: string): string {
  return join(expandHome(DEFAULT_DATA_DIR), "app", version);
}

/**
 * Ensure a standalone server build exists for `version`. Downloads the
 * release tarball published by the CI workflow and verifies its checksum.
 * Returns the directory containing `.output/server/index.mjs`, or null.
 */
export async function ensureStandaloneApp(
  version: string,
  opts: { repo?: string; log?: (m: string) => void } = {},
): Promise<string | null> {
  const dir = appCacheDir(version);
  const entry = join(dir, ".output", "server", "index.mjs");
  if (existsSync(entry)) return dir;

  const repo = opts.repo ?? "OpenExpert/OpenExpert";
  const log = opts.log ?? (() => {});
  const base = `https://github.com/${repo}/releases/download/v${version}`;
  const tarball = `openexpert-server-${version}.tar.gz`;
  const url = `${base}/${tarball}`;
  const shaUrl = `${base}/${tarball}.sha256`;

  log(`downloading ${url}`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());

    // Verify checksum when the .sha256 asset is available.
    try {
      const shaRes = await fetch(shaUrl, { signal: AbortSignal.timeout(15_000) });
      if (shaRes.ok) {
        const expected = (await shaRes.text()).trim().split(/\s+/)[0];
        const actual = createHash("sha256").update(buf).digest("hex");
        if (expected && expected !== actual) {
          log("checksum mismatch, aborting");
          return null;
        }
      }
    } catch {
      // No checksum asset: continue (release is fetched over HTTPS).
    }

    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, tarball);
    writeFileSync(tmp, buf);
    const r = spawnSync("tar", ["-xzf", tmp, "-C", dir], { stdio: "ignore" });
    if (r.status !== 0) return null;
    return existsSync(entry) ? dir : null;
  } catch {
    return null;
  }
}

export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<number> {
  return new Promise((res) => {
    const child = spawn(cmd, args, { stdio: "inherit", cwd: opts.cwd, env: opts.env });
    const forward = (sig: NodeJS.Signals) => () => child.kill(sig);
    process.on("SIGINT", forward("SIGINT"));
    process.on("SIGTERM", forward("SIGTERM"));
    child.on("exit", (code) => res(code ?? 0));
  });
}
