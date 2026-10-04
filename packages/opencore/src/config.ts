// SPDX-License-Identifier: MIT
// OpenCore — local configuration.
// Precedence: OPENEXPERT_* env vars > openexpert.json > defaults.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ModelProviderId } from "./model-provider.js";

export type OpenExpertConfig = {
  mode: "local" | "cloud";
  modelProvider: ModelProviderId;
  modelId: string;
  ollamaBaseUrl: string;
  dataDir: string;
};

export const DEFAULTS: OpenExpertConfig = {
  mode: "cloud",
  modelProvider: "google",
  modelId: "gemini-2.5-flash",
  ollamaBaseUrl: "http://localhost:11434",
  dataDir: "~/.openexpert",
};

function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    const home = process.env["HOME"] || process.env["USERPROFILE"] || "~";
    return join(home, p.slice(2));
  }
  return p;
}

export function loadConfig(cwd: string = process.cwd()): OpenExpertConfig {
  let file: Partial<OpenExpertConfig> = {};
  const path = join(cwd, "openexpert.json");
  if (existsSync(path)) {
    try {
      file = JSON.parse(readFileSync(path, "utf8")) as Partial<OpenExpertConfig>;
    } catch {
      // Broken file: ignore it, env/defaults win.
      file = {};
    }
  }
  const env = process.env;
  const providerEnv = env["OPENEXPERT_MODEL_PROVIDER"];
  const providerFromEnv: ModelProviderId | undefined =
    providerEnv === "google" ||
    providerEnv === "ollama" ||
    providerEnv === "openai-compatible" ||
    providerEnv === "openexpert"
      ? providerEnv
      : undefined;

  return {
    mode: env["OPENEXPERT_MODE"] === "local" ? "local" : (file.mode ?? DEFAULTS.mode),
    modelProvider: providerFromEnv ?? file.modelProvider ?? DEFAULTS.modelProvider,
    modelId: env["OPENEXPERT_MODEL_ID"] ?? file.modelId ?? DEFAULTS.modelId,
    ollamaBaseUrl: env["OLLAMA_BASE_URL"] ?? file.ollamaBaseUrl ?? DEFAULTS.ollamaBaseUrl,
    dataDir: expandHome(env["OPENEXPERT_DATA_DIR"] ?? file.dataDir ?? DEFAULTS.dataDir),
  };
}

/**
 * Validate a parsed `openexpert.json` against the JSON Schema shipped
 * with the package. Returns the parsed object or throws on invalid input.
 */
export function validateConfig(raw: unknown): OpenExpertConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("openexpert.json: expected an object");
  }
  const o = raw as Record<string, unknown>;
  if (o.mode !== undefined && o.mode !== "local" && o.mode !== "cloud") {
    throw new Error(`openexpert.json: mode must be "local" or "cloud"`);
  }
  if (
    o.modelProvider !== undefined &&
    !["google", "ollama", "openai-compatible", "openexpert"].includes(String(o.modelProvider))
  ) {
    throw new Error(
      `openexpert.json: modelProvider must be one of google|ollama|openai-compatible|openexpert`,
    );
  }
  return loadConfig();
}
