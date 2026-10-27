// SPDX-License-Identifier: MIT
// Non-interactive CLI commands: doctor, fix, models, serve, version, update.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_OLLAMA_URL, endpointOf, isProviderId, providerDef } from "../providers.js";
import { loadConfigWithNotices } from "../config.js";
import { providerKeyMessage } from "../model-provider.js";
import { listProviderModels, modelToolSupport } from "../provider-models.js";
import {
  DEFAULT_DATA_DIR,
  appCacheDir,
  ensureStandaloneApp,
  findRepoRoot,
  localServerEnv,
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
  console.log(`OpenExpert ${packageVersion()}`);
  return 0;
}

// Takes the directory the command was given: reading the config from
// process.cwd() made `doctor` and `models` ignore an `openexpert.json` in the
// directory they were pointed at, while everything around them honoured it.
function configuredProvider(cwd = process.cwd()): Provider {
  const raw = process.env["OPENEXPERT_MODEL_PROVIDER"] || readConfig(cwd).modelProvider;
  // The catalogue is the list: an id no record claims is not a provider.
  return isProviderId(raw) ? raw : "google";
}

/** The environment the model layer will see: real variables win over secrets. */
function effectiveEnv(cwd = process.cwd()): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...readSecrets(cwd), ...process.env };
  // The CLI has no bridge from openexpert.json into the environment (the server
  // builds its own), so the endpoint written in the file has to be honoured here
  // or `models` would talk to the default port while the app talks elsewhere.
  const fromFile = readConfig(cwd).ollamaBaseUrl;
  if (fromFile && !process.env["OLLAMA_BASE_URL"]) env["OLLAMA_BASE_URL"] = fromFile;
  return env;
}

export async function cmdDoctor(cwd = process.cwd()): Promise<number> {
  const provider = configuredProvider(cwd);
  const def = providerDef(provider);
  const dataDir = resolvedDataDir(cwd);
  const secrets = readSecrets(cwd);
  const env = effectiveEnv(cwd);
  // The same reader the application uses, so the CLI and the server agree on
  // what a configuration file means. The notices are what the file had to
  // give up to be used.
  const { notices } = loadConfigWithNotices(cwd);

  console.log("OpenExpert doctor");
  console.log(`  provider: ${provider}${def ? ` (${def.name})` : ""}`);
  console.log(`  data dir: ${dataDir}`);

  const problems: string[] = [];

  // A limit above the one the application accepts is not a problem the owner
  // has to fix before starting: the value is brought back to the limit when
  // the file is read. But it has to be said, because the file on disk and the
  // running application do not agree and nothing else would say so.
  for (const notice of notices) {
    if (notice.kind === "patterns") {
      console.log(
        `  aviso:    ${notice.dropped} patrón(es) de inyección descartados (el máximo son ${notice.limit}).`,
      );
    } else {
      console.log(
        `  aviso:    ${notice.field}: ${notice.value} se recorta a ${notice.limit} (el límite).`,
      );
    }
  }

  // One check for every provider: the catalogue says which variable holds its
  // key, so a record added tomorrow is covered without touching this function.
  const missing = def ? providerKeyMessage(def, env) : null;
  if (missing) problems.push(`${missing} Ejecuta \`openexpert init\` o escríbela en secrets.json.`);

  if (def?.baseUrlEnv && !endpointOf(provider, env)) {
    problems.push(`Falta ${def.baseUrlEnv}.`);
  } else if (def?.baseUrlEnv) {
    console.log(`  endpoint: ${endpointOf(provider, env)}`);
  }
  const model =
    process.env["OPENEXPERT_MODEL_ID"] || readConfig(cwd).modelId || def?.models[0]?.id || "";
  if (model) {
    console.log(`  model:    ${model}`);
    const support = await modelToolSupport(provider, model, { env, timeoutMs: 1500 });
    if (support === "no") {
      problems.push(
        `El modelo ${model} no admite herramientas (tool calling), así que no puede consultar tus datos. Elige uno compatible, como llama3.1.`,
      );
    } else if (support === "unknown") {
      console.log("  note:     no se pudo comprobar si el modelo admite herramientas.");
    }
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
    const local = await listProviderModels("ollama", { env: effectiveEnv(cwd) });
    writeConfig(
      {
        modelProvider: "ollama",
        modelId: local.models[0] ?? "llama3.1",
        ollamaBaseUrl: DEFAULT_OLLAMA_URL,
        dataDir: DEFAULT_DATA_DIR,
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
  console.log("\nSiguiente paso: `openexpert serve` (o `openexpert init` para elegir modelo).");
  return 0;
}

export async function cmdModels(cwd = process.cwd()): Promise<number> {
  const provider = configuredProvider(cwd);
  const def = providerDef(provider);
  const cfg = readConfig(cwd);
  const env = effectiveEnv(cwd);

  // Any provider the catalogue knows is asked the same way; the record says
  // where its endpoint and its key live.
  const listed = await listProviderModels(provider, { env });

  if (!listed.ok) {
    console.log(listed.error ?? `No se pudieron listar los modelos de ${provider}.`);
    if (provider === "ollama") {
      console.log("Instálalo con: curl -fsSL https://ollama.com/install.sh | sh");
    }
    if (listed.models.length) {
      console.log(`Modelos conocidos para ${def?.name ?? provider}:`);
      for (const m of listed.models) console.log(`  ${m === cfg.modelId ? "*" : " "} ${m}`);
    }
    return 1;
  }

  console.log(`Modelos en ${def?.name ?? provider}:`);
  for (const m of listed.models) console.log(`  ${m === cfg.modelId ? "*" : " "} ${m}`);
  if (!listed.models.length) console.log("  (ninguno; prueba `ollama pull llama3.1`)");
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
  const serverEnv: Record<string, string> = {
    ...(env as Record<string, string>),
    ...localServerEnv(),
    PORT: process.env["PORT"] || "3000",
  };
  // Print constants, never values read from the environment: CodeQL flags an
  // environment value written to a log as clear-text logging of sensitive data.
  const customEndpoint = serverEnv["HOST"] !== "127.0.0.1" || serverEnv["PORT"] !== "3000";
  console.log(
    "Arrancando OpenExpert en http://127.0.0.1:3000 …" +
      (customEndpoint ? " (host o puerto personalizados: mira OPENEXPERT_HOST y PORT)" : ""),
  );
  return run(process.execPath, [join(app, ".output", "server", "index.mjs")], {
    cwd: app,
    env: serverEnv,
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
