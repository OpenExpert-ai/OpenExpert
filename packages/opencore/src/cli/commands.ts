// SPDX-License-Identifier: MIT
// Non-interactive CLI commands: doctor, fix, models, serve, version, update.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ollamaApiBaseUrl } from "../model-provider.js";
import {
  DEFAULT_OLLAMA_URL,
  appCacheDir,
  detectOllama,
  ensureStandaloneApp,
  findRepoRoot,
  httpGetJson,
  packageVersion,
  readConfig,
  readSecrets,
  resolvedDataDir,
  run,
  secretsAsEnv,
  writeConfig,
  type Provider,
} from "./lib.js";

export function cmdVersion(): number {
  console.log(`@openexpert/opencore ${packageVersion()}`);
  return 0;
}

function configuredProvider(): Provider {
  const raw = process.env["OPENEXPERT_MODEL_PROVIDER"] || readConfig().modelProvider;
  if (raw === "ollama" || raw === "openai-compatible") return raw;
  return "google";
}

export function cmdDoctor(cwd = process.cwd()): number {
  const provider = configuredProvider();
  const dataDir = resolvedDataDir(cwd);
  const secrets = readSecrets(cwd);

  console.log("OpenCore doctor");
  console.log(`  provider: ${provider}`);
  console.log(`  data dir: ${dataDir}`);

  const problems: string[] = [];

  if (provider === "google" && !process.env["GOOGLE_API_KEY"] && !secrets.GOOGLE_API_KEY) {
    problems.push("Falta GOOGLE_API_KEY. Ejecuta `opencore init` o usa Ollama.");
  }
  if (provider === "openai-compatible") {
    if (!process.env["OPENEXPERT_MODEL_KEY"] && !secrets.OPENEXPERT_MODEL_KEY) {
      problems.push("Falta OPENEXPERT_MODEL_KEY.");
    }
    if (!process.env["OPENEXPERT_BASE_URL"] && !secrets.OPENEXPERT_BASE_URL) {
      problems.push("Falta OPENEXPERT_BASE_URL.");
    }
  }
  if (provider === "ollama") {
    console.log(`  ollama:   ${process.env["OLLAMA_BASE_URL"] || DEFAULT_OLLAMA_URL}`);
  }
  if (!process.env["GOOGLE_CLIENT_ID"] && !secrets.GOOGLE_CLIENT_ID) {
    console.log("  note:     sin Google OAuth el chat funciona; Drive queda desconectado.");
  }
  try {
    mkdirSync(dataDir, { recursive: true });
  } catch {
    problems.push(`No se puede escribir en ${dataDir}.`);
  }

  if (!problems.length) {
    console.log("  OK: listo para arrancar.");
    return 0;
  }
  console.log("  pendiente:");
  for (const x of problems) console.log(`  - ${x}`);
  return 1;
}

export async function cmdFix(cwd = process.cwd()): Promise<number> {
  const dataDir = resolvedDataDir(cwd);
  mkdirSync(dataDir, { recursive: true });

  if (!existsSync(join(cwd, "openexpert.json"))) {
    const ollama = await detectOllama();
    writeConfig(
      {
        modelProvider: "ollama",
        modelId: ollama.models[0] ?? "llama3.1",
        ollamaBaseUrl: DEFAULT_OLLAMA_URL,
        dataDir: "~/.openexpert",
      },
      cwd,
    );
    console.log("✓ openexpert.json creado (Ollama).");
  } else {
    console.log("• openexpert.json ya existe.");
  }

  const secrets = readSecrets(cwd);
  if (Object.keys(secrets).length) {
    const p = join(dataDir, "secrets.json");
    writeFileSync(p, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    console.log(`✓ permisos de ${p} normalizados (0600).`);
  }

  console.log("✓ directorio de datos listo:", dataDir);
  cmdDoctor(cwd);
  console.log("\nSiguiente paso: `opencore serve` (o `opencore init` para elegir modelo).");
  return 0;
}

export async function cmdModels(cwd = process.cwd()): Promise<number> {
  const provider = configuredProvider();
  const secrets = readSecrets(cwd);
  const cfg = readConfig(cwd);

  if (provider === "ollama") {
    const base = ollamaApiBaseUrl(
      process.env["OLLAMA_BASE_URL"] || cfg.ollamaBaseUrl || DEFAULT_OLLAMA_URL,
    );
    const { up, models } = await detectOllama(base);
    if (!up) {
      console.log(`No se puede contactar con Ollama en ${base}.`);
      console.log("Instálalo con: curl -fsSL https://ollama.com/install.sh | sh");
      return 1;
    }
    console.log(`Modelos en Ollama (${base}):`);
    for (const m of models) console.log(`  ${m === cfg.modelId ? "*" : " "} ${m}`);
    if (!models.length) console.log("  (ninguno; prueba `ollama pull llama3.1`)");
    return 0;
  }

  if (provider === "openai-compatible") {
    const base = process.env["OPENEXPERT_BASE_URL"] || secrets.OPENEXPERT_BASE_URL;
    const key = process.env["OPENEXPERT_MODEL_KEY"] || secrets.OPENEXPERT_MODEL_KEY;
    if (!base || !key) {
      console.log("Configura OPENEXPERT_BASE_URL y OPENEXPERT_MODEL_KEY (opencore init).");
      return 1;
    }
    const data = await httpGetJson<{ data?: { id: string }[] }>(
      `${base.replace(/\/+$/, "")}/models`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!data) {
      console.log("No se pudo listar modelos del endpoint.");
      return 1;
    }
    console.log("Modelos disponibles:");
    for (const m of data.data ?? []) console.log(`  ${m.id === cfg.modelId ? "*" : " "} ${m.id}`);
    return 0;
  }

  console.log("Proveedor google: usa `gemini-2.5-flash` o consulta Google AI Studio.");
  return 0;
}

export async function cmdServe(cwd = process.cwd()): Promise<number> {
  const env = { ...process.env, ...secretsAsEnv(cwd) } as NodeJS.ProcessEnv;

  const repo = findRepoRoot(cwd);
  if (repo) {
    console.log("Arrancando OpenExpert (desde el código fuente)…");
    return run("npm", ["run", "dev"], { cwd: repo, env });
  }

  const version = packageVersion();
  const app = await ensureStandaloneApp(version, { log: (m) => console.log(`  ${m}`) });
  if (!app) {
    console.error(
      "No hay un servidor preconstruido disponible y no se pudo descargar.\n" +
        "Opciones:\n" +
        "  • Usa Docker:  docker run -p 3000:3000 -v openexpert-data:/data ghcr.io/openexpert-ai/openexpert:local\n" +
        "  • O clona el repositorio y ejecuta `npm ci && npm run dev`.",
    );
    return 1;
  }
  console.log("Arrancando OpenCore en http://localhost:3000 …");
  return run(process.execPath, [join(app, ".output", "server", "index.mjs")], {
    cwd: app,
    env: { ...env, PORT: process.env["PORT"] || "3000" },
  });
}

export function cmdUpdate(): number {
  const dir = appCacheDir(packageVersion());
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`✓ caché del servidor eliminada (${dir}).`);
  } else {
    console.log("No hay servidor descargado que actualizar.");
  }
  return 0;
}
