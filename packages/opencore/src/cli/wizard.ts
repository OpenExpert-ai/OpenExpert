// SPDX-License-Identifier: MIT
// Interactive setup wizard: pick a model provider, write config + secrets.
//
// The menu is the catalogue. Each record says whether it needs a key, where it
// is written, whether its endpoint is the owner's to provide and which models it
// knows, so a new provider appears here without touching this file.

import * as p from "@clack/prompts";
import { DEFAULT_OLLAMA_URL, defaultModelOf, providerDef, PROVIDERS } from "../providers.js";
import { listProviderModels } from "../provider-models.js";
import {
  DEFAULT_DATA_DIR,
  readConfig,
  writeConfig,
  writeSecrets,
  type FileConfig,
  type Provider,
  type Secrets,
} from "./lib.js";

export type WizardResult = {
  config: FileConfig;
  secrets: Secrets;
  provider: Provider;
  modelId: string;
  started: boolean;
};

function bail(): never {
  p.cancel("Configuración cancelada.");
  process.exit(1);
}

export async function runWizard(
  opts: { cwd?: string; assumeYes?: boolean } = {},
): Promise<WizardResult> {
  const cwd = opts.cwd ?? process.cwd();
  const existing = readConfig(cwd);
  const nonInteractive = opts.assumeYes || !process.stdin.isTTY;

  if (nonInteractive) {
    const local = await listProviderModels("ollama");
    const config: FileConfig = {
      modelProvider: "ollama",
      modelId: local.models[0] ?? defaultModelOf("ollama"),
      ollamaBaseUrl: DEFAULT_OLLAMA_URL,
      dataDir: DEFAULT_DATA_DIR,
    };
    writeConfig(config, cwd);
    return { config, secrets: {}, provider: "ollama", modelId: config.modelId!, started: false };
  }

  p.intro("OpenExpert — configuración");

  const spin = p.spinner();
  spin.start("Buscando Ollama local…");
  const local = await listProviderModels("ollama");
  spin.stop(
    local.ok ? `Ollama detectado (${local.models.length} modelo(s))` : "No se ha detectado Ollama",
  );

  const choice = await p.select({
    message: "¿Qué modelo quieres usar?",
    options: [
      ...(local.ok
        ? [
            {
              value: "ollama" as Provider,
              label: providerDef("ollama")?.name ?? "Ollama",
              hint: "sin claves, datos en tu equipo",
            },
          ]
        : []),
      ...PROVIDERS.filter((prov) => prov.id !== "ollama").map((prov) => ({
        value: prov.id,
        label: prov.name,
        hint: prov.note,
      })),
      ...(!local.ok
        ? [{ value: "install-ollama" as const, label: "Instalar Ollama", hint: "te muestro cómo" }]
        : []),
    ],
  });
  if (p.isCancel(choice)) bail();

  if (choice === "install-ollama") {
    p.note(
      "Instala Ollama y descarga un modelo:\n\n" +
        "  curl -fsSL https://ollama.com/install.sh | sh\n" +
        "  ollama pull llama3.1\n\n" +
        "Vuelve a ejecutar `openexpert init` cuando esté listo.",
      "Instalar Ollama",
    );
    p.outro("Sin cambios.");
    process.exit(0);
  }

  const def = providerDef(choice);
  if (!def) bail();

  const config: FileConfig = { dataDir: DEFAULT_DATA_DIR, modelProvider: choice };
  const secrets: Secrets = {};

  if (choice === "ollama") {
    const models = local.models.length ? local.models : [defaultModelOf("ollama")];
    const picked = await p.select({
      message: "Modelo de Ollama",
      options: models.map((m) => ({ value: m, label: m })),
    });
    if (p.isCancel(picked)) bail();
    config.modelId = String(picked);
    config.ollamaBaseUrl = DEFAULT_OLLAMA_URL;
  } else {
    // The owner's endpoint, when the record says the endpoint is theirs.
    if (def.baseUrlEnv && !def.baseUrl) {
      const baseURL = await p.text({
        message: `${def.baseUrlEnv} — ${def.baseUrlHint ?? "dirección del servicio"}`,
        initialValue: def.baseUrlDefault ?? "",
      });
      if (p.isCancel(baseURL)) bail();
      if (String(baseURL)) secrets[def.baseUrlEnv] = String(baseURL);
    }
    // Its own key, under its own variable: never shared with another provider.
    if (def.env) {
      const apiKey = await p.password({
        message: `${def.env}${def.keyUrl ? ` (${def.keyUrl})` : ""}`,
      });
      if (p.isCancel(apiKey)) bail();
      if (String(apiKey)) secrets[def.env] = String(apiKey);
    }
    const suggested = defaultModelOf(choice);
    const id = await p.text({ message: "Modelo", initialValue: suggested });
    if (p.isCancel(id)) bail();
    config.modelId = String(id) || suggested;
  }

  writeConfig({ ...existing, ...config }, cwd);
  if (Object.keys(secrets).length) writeSecrets(secrets, cwd);

  p.outro(
    `Configuración guardada en openexpert.json (modelo: ${config.modelProvider}:${config.modelId}).`,
  );

  const go = await p.confirm({ message: "¿Arrancar ahora?", initialValue: true });
  if (p.isCancel(go)) bail();

  return {
    config: { ...existing, ...config },
    secrets,
    provider: choice,
    modelId: config.modelId ?? "",
    started: Boolean(go),
  };
}
