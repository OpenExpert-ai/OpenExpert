// SPDX-License-Identifier: MIT
// Interactive setup wizard: pick a model provider, write config + secrets.

import * as p from "@clack/prompts";
import {
  DEFAULT_GATEWAY_URL,
  DEFAULT_OLLAMA_URL,
  detectOllama,
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

function cancelled(v: unknown): boolean {
  if (p.isCancel(v)) bail();
  return false;
}

export async function runWizard(
  opts: { cwd?: string; assumeYes?: boolean } = {},
): Promise<WizardResult> {
  const cwd = opts.cwd ?? process.cwd();
  const existing = readConfig(cwd);
  const nonInteractive = opts.assumeYes || !process.stdin.isTTY;

  if (nonInteractive) {
    // Sensible defaults without prompting.
    const ollama = await detectOllama();
    const provider: Provider = ollama.up ? "ollama" : "ollama";
    const config: FileConfig = {
      mode: "local",
      modelProvider: provider,
      modelId: ollama.models[0] ?? "llama3.1",
      ollamaBaseUrl: DEFAULT_OLLAMA_URL,
      dataDir: "~/.openexpert",
    };
    writeConfig(config, cwd);
    return { config, secrets: {}, provider, modelId: config.modelId!, started: false };
  }

  p.intro("OpenCore — configuración");

  const spin = p.spinner();
  spin.start("Buscando Ollama local…");
  const ollama = await detectOllama();
  spin.stop(
    ollama.up
      ? `Ollama detectado (${ollama.models.length} modelo(s))`
      : "No se ha detectado Ollama",
  );

  const choice = await p.select({
    message: "¿Qué modelo quieres usar?",
    options: [
      ...(ollama.up
        ? [
            {
              value: "ollama" as const,
              label: "Modelo local (Ollama)",
              hint: "sin claves, datos en tu equipo",
            },
          ]
        : []),
      {
        value: "openexpert" as const,
        label: "Pasarela OpenExpert",
        hint: "con tu token de cuenta",
      },
      { value: "google" as const, label: "Google Gemini (BYOK)", hint: "con tu clave" },
      {
        value: "openai-compatible" as const,
        label: "Otro endpoint compatible",
        hint: "BYOK",
      },
      ...(!ollama.up
        ? [{ value: "install-ollama" as const, label: "Instalar Ollama", hint: "te muestro cómo" }]
        : []),
    ],
  });
  cancelled(choice);

  if (choice === "install-ollama") {
    p.note(
      "Instala Ollama y descarga un modelo:\n\n" +
        "  curl -fsSL https://ollama.com/install.sh | sh\n" +
        "  ollama pull llama3.1\n\n" +
        "Vuelve a ejecutar `opencore init` cuando esté listo.",
      "Instalar Ollama",
    );
    p.outro("Sin cambios.");
    process.exit(0);
  }

  const config: FileConfig = { mode: "local", dataDir: "~/.openexpert" };
  const secrets: Secrets = {};
  let modelId = "llama3.1";

  if (choice === "ollama") {
    const models = ollama.models.length ? ollama.models : ["llama3.1"];
    const picked = await p.select({
      message: "Modelo de Ollama",
      options: models.map((m) => ({ value: m, label: m })),
    });
    cancelled(picked);
    modelId = String(picked);
    config.modelProvider = "ollama";
    config.modelId = modelId;
    config.ollamaBaseUrl = DEFAULT_OLLAMA_URL;
  } else if (choice === "openexpert") {
    const baseURL = await p.text({
      message: "URL de la pasarela",
      initialValue: DEFAULT_GATEWAY_URL,
    });
    cancelled(baseURL);
    const apiKey = await p.password({ message: "Token de cuenta" });
    cancelled(apiKey);
    const id = await p.text({ message: "Modelo", initialValue: "openexpert-default" });
    cancelled(id);
    modelId = String(id) || "openexpert-default";
    config.modelProvider = "openexpert";
    config.modelId = modelId;
    secrets.OPENEXPERT_GATEWAY_URL = String(baseURL);
    secrets.OPENEXPERT_API_KEY = String(apiKey);
  } else if (choice === "google") {
    const apiKey = await p.password({ message: "GOOGLE_API_KEY" });
    cancelled(apiKey);
    const id = await p.text({ message: "Modelo", initialValue: "gemini-2.5-flash" });
    cancelled(id);
    modelId = String(id) || "gemini-2.5-flash";
    config.modelProvider = "google";
    config.modelId = modelId;
    secrets.GOOGLE_API_KEY = String(apiKey);
  } else if (choice === "openai-compatible") {
    const baseURL = await p.text({ message: "Base URL (…/v1)", initialValue: "" });
    cancelled(baseURL);
    const apiKey = await p.password({ message: "API key" });
    cancelled(apiKey);
    const id = await p.text({ message: "Modelo", initialValue: "gpt-4o-mini" });
    cancelled(id);
    modelId = String(id) || "gpt-4o-mini";
    config.modelProvider = "openai-compatible";
    config.modelId = modelId;
    secrets.OPENEXPERT_BASE_URL = String(baseURL);
    secrets.OPENEXPERT_MODEL_KEY = String(apiKey);
  }

  const merged: FileConfig = { ...existing, ...config };
  writeConfig(merged, cwd);
  if (Object.keys(secrets).length) writeSecrets({ ...secrets }, cwd);

  p.outro(
    `Configuración guardada en openexpert.json (modelo: ${config.modelProvider}:${modelId}).`,
  );

  const go = await p.confirm({ message: "¿Arrancar ahora?", initialValue: true });
  cancelled(go);

  return {
    config: merged,
    secrets,
    provider: config.modelProvider as Provider,
    modelId,
    started: Boolean(go),
  };
}
