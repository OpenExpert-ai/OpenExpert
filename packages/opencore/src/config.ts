// SPDX-License-Identifier: MIT
// OpenCore — local configuration.
// Precedence: OPENEXPERT_* env vars > openexpert.json > defaults.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelProviderId } from "./model-provider.js";

export type AiConfig = {
  temperature: number;
  topP: number;
  maxOutputTokens: number;
};

export type ChatConfig = {
  maxSteps: number;
  injectionGuard: boolean;
  injectionExtraPatterns: string[];
  retentionDays: number;
};

export type OpenExpertConfig = {
  modelProvider: ModelProviderId;
  modelId: string;
  ollamaBaseUrl: string;
  dataDir: string;
  /**
   * Google OAuth client ID for the shared, distributor-baked client. Non-secret
   * (public identifier); the secret lives in env or ~/.openexpert/secrets.json.
   * End users never edit this.
   */
  googleClientId: string;
  ai: AiConfig;
  chat: ChatConfig;
};

export const DEFAULTS: OpenExpertConfig = {
  modelProvider: "google",
  modelId: "gemini-2.5-flash",
  ollamaBaseUrl: "http://localhost:11434",
  dataDir: "~/.openexpert",
  googleClientId: "",
  ai: { temperature: 0.2, topP: 1, maxOutputTokens: 4096 },
  chat: {
    maxSteps: 50,
    injectionGuard: true,
    injectionExtraPatterns: [],
    retentionDays: 30,
  },
};

function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    const home = process.env["HOME"] || process.env["USERPROFILE"] || "~";
    return join(home, p.slice(2));
  }
  return p;
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
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
    providerEnv === "google" || providerEnv === "ollama" || providerEnv === "openai-compatible"
      ? providerEnv
      : undefined;

  const fileAi: Partial<AiConfig> = file.ai ?? {};
  const fileChat: Partial<ChatConfig> = file.chat ?? {};

  return {
    modelProvider: providerFromEnv ?? file.modelProvider ?? DEFAULTS.modelProvider,
    modelId: env["OPENEXPERT_MODEL_ID"] ?? file.modelId ?? DEFAULTS.modelId,
    ollamaBaseUrl: env["OLLAMA_BASE_URL"] ?? file.ollamaBaseUrl ?? DEFAULTS.ollamaBaseUrl,
    dataDir: expandHome(env["OPENEXPERT_DATA_DIR"] ?? file.dataDir ?? DEFAULTS.dataDir),
    googleClientId:
      env["OPENEXPERT_GOOGLE_CLIENT_ID"] ?? file.googleClientId ?? DEFAULTS.googleClientId,
    ai: {
      temperature: num(fileAi.temperature, DEFAULTS.ai.temperature),
      topP: num(fileAi.topP, DEFAULTS.ai.topP),
      maxOutputTokens: num(fileAi.maxOutputTokens, DEFAULTS.ai.maxOutputTokens),
    },
    chat: {
      maxSteps: num(fileChat.maxSteps, DEFAULTS.chat.maxSteps),
      injectionGuard: fileChat.injectionGuard ?? DEFAULTS.chat.injectionGuard,
      injectionExtraPatterns: Array.isArray(fileChat.injectionExtraPatterns)
        ? fileChat.injectionExtraPatterns.filter((p): p is string => typeof p === "string")
        : DEFAULTS.chat.injectionExtraPatterns,
      retentionDays: num(fileChat.retentionDays, DEFAULTS.chat.retentionDays),
    },
  };
}
