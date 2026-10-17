// SPDX-License-Identifier: MIT
// OpenCore — local configuration.
// Precedence: OPENEXPERT_* env vars > openexpert.json > defaults.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultModelOf, isProviderId, type ModelProviderId } from "./providers.js";

export type AiConfig = {
  temperature: number;
  topP: number;
  maxOutputTokens: number;
};

export type ChatConfig = {
  maxSteps: number;
  injectionGuard: boolean;
  /** Read a scanned PDF with the model. Off by default: it sends the document to the provider. */
  visionPdf: boolean;
  injectionExtraPatterns: string[];
  retentionDays: number;
};

export type OpenExpertConfig = {
  modelProvider: ModelProviderId;
  modelId: string;
  ollamaBaseUrl: string;
  dataDir: string;
  /**
   * Google OAuth client ID (non-secret public identifier) for the Drive
   * integration. The secret lives in env or ~/.openexpert/secrets.json.
   */
  googleClientId: string;
  /**
   * Notion OAuth client ID (non-secret public identifier) for the Notion
   * connection. The secret lives in env or ~/.openexpert/secrets.json.
   */
  notionClientId: string;
  ai: AiConfig;
  chat: ChatConfig;
};

export const DEFAULTS: OpenExpertConfig = {
  modelProvider: "google",
  modelId: "gemini-2.5-flash",
  ollamaBaseUrl: "http://localhost:11434",
  dataDir: "~/.openexpert",
  googleClientId: "",
  notionClientId: "",
  ai: { temperature: 0.5, topP: 1, maxOutputTokens: 4096 },
  chat: {
    maxSteps: 50,
    injectionGuard: true,
    visionPdf: false,
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
  // The provider is validated against the catalogue on both paths: an id that
  // no record claims (a typo, or a service that was removed) must fall back to
  // the default instead of travelling on as if it were usable.
  const providerEnv = env["OPENEXPERT_MODEL_PROVIDER"];
  const provider: ModelProviderId = isProviderId(providerEnv)
    ? providerEnv
    : isProviderId(file.modelProvider)
      ? file.modelProvider
      : DEFAULTS.modelProvider;

  const fileAi: Partial<AiConfig> = file.ai ?? {};
  const fileChat: Partial<ChatConfig> = file.chat ?? {};

  return {
    modelProvider: provider,
    modelId:
      env["OPENEXPERT_MODEL_ID"] ?? file.modelId ?? (defaultModelOf(provider) || DEFAULTS.modelId),
    ollamaBaseUrl: env["OLLAMA_BASE_URL"] ?? file.ollamaBaseUrl ?? DEFAULTS.ollamaBaseUrl,
    dataDir: expandHome(env["OPENEXPERT_DATA_DIR"] ?? file.dataDir ?? DEFAULTS.dataDir),
    googleClientId:
      env["OPENEXPERT_GOOGLE_CLIENT_ID"] ?? file.googleClientId ?? DEFAULTS.googleClientId,
    notionClientId:
      env["OPENEXPERT_NOTION_CLIENT_ID"] ?? file.notionClientId ?? DEFAULTS.notionClientId,
    ai: {
      temperature: num(fileAi.temperature, DEFAULTS.ai.temperature),
      topP: num(fileAi.topP, DEFAULTS.ai.topP),
      maxOutputTokens: num(fileAi.maxOutputTokens, DEFAULTS.ai.maxOutputTokens),
    },
    chat: {
      maxSteps: num(fileChat.maxSteps, DEFAULTS.chat.maxSteps),
      injectionGuard: fileChat.injectionGuard ?? DEFAULTS.chat.injectionGuard,
      visionPdf: fileChat.visionPdf ?? DEFAULTS.chat.visionPdf,
      injectionExtraPatterns: Array.isArray(fileChat.injectionExtraPatterns)
        ? fileChat.injectionExtraPatterns.filter((p): p is string => typeof p === "string")
        : DEFAULTS.chat.injectionExtraPatterns,
      retentionDays: num(fileChat.retentionDays, DEFAULTS.chat.retentionDays),
    },
  };
}
