// SPDX-License-Identifier: MIT
// Server-side configuration.
//
// Two canonical files, shared with the CLI:
//   openexpert.json                  provider, model, sampling and chat options
//   ~/.openexpert/secrets.json       API keys (mode 0600)
//
// Precedence when reading: real environment > openexpert.json > secrets.json >
// defaults. The settings panel writes the files and mirrors the result into
// process.env so changes take effect without a restart.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { loadConfig } from "@openexpert/opencore/config";
import type { AiConfig, ChatConfig, OpenExpertConfig } from "@openexpert/opencore/config";
import { patternsAreValid } from "./ai/injection";
import { configPath, dataDir, dbPath, secretsPath } from "./paths.server";

export type ConfigSource = "env" | "file" | "secrets" | "default";

/**
 * Minimal `.env` reader (no dependency). Loaded once at boot, before
 * `envAtBoot` is captured, so `.env` behaves like a real environment variable
 * and wins over `openexpert.json` and `secrets.json`. Existing process env
 * always wins. Quotes around values are stripped.
 */
function loadDotEnv(): void {
  // Tests must be hermetic: never read the developer's .env under Vitest.
  if (process.env["VITEST"]) return;
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return;
  try {
    const text = readFileSync(path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (!key || key in process.env) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // A malformed .env must never stop the server from booting.
  }
}
loadDotEnv();

/** Environment variables that existed before we loaded openexpert.json/secrets. */
const envAtBoot = new Set(Object.keys(process.env));

export type SecretName =
  | "GOOGLE_API_KEY"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "GOOGLE_PICKER_API_KEY"
  | "OPENEXPERT_MODEL_KEY"
  | "OPENEXPERT_BASE_URL";

/* ------------------------------ raw files ------------------------------ */

export type RawFileConfig = Partial<OpenExpertConfig> & { $schema?: string };

export function readFileConfigRaw(cwd: string = process.cwd()): RawFileConfig {
  const path = configPath(cwd);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RawFileConfig;
  } catch {
    return {};
  }
}

function atomicWrite(path: string, contents: string, mode?: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, contents, mode ? { mode } : undefined);
  renameSync(tmp, path);
}

/** Merge `partial` into openexpert.json, preserving `$schema` and unknown keys. */
export function writeFileConfig(partial: RawFileConfig, cwd: string = process.cwd()): void {
  const current = readFileConfigRaw(cwd);
  const next: RawFileConfig = {
    $schema: current.$schema ?? "./packages/opencore/schema/openexpert.schema.json",
    ...current,
    ...partial,
  };
  atomicWrite(configPath(cwd), `${JSON.stringify(next, null, 2)}\n`);
}

export function readSecrets(): Record<string, string> {
  const path = secretsPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Set (`value`) or delete (`null`) a secret. The file stays 0600. */
export function writeSecret(name: string, value: string | null): void {
  const secrets = readSecrets();
  if (value === null || value === "") delete secrets[name];
  else secrets[name] = value;
  atomicWrite(secretsPath(), `${JSON.stringify(secrets, null, 2)}\n`, 0o600);
}

/* --------------------------- environment bridge -------------------------- */

/** Keys whose current value in process.env came from openexpert.json. */
const fileAppliedEnv = new Set<string>();

function assignFromFile(key: string, value: unknown): void {
  if (envAtBoot.has(key)) return; // A real environment variable always wins.
  if (value === undefined || value === null || value === "") {
    if (fileAppliedEnv.has(key)) {
      delete process.env[key];
      fileAppliedEnv.delete(key);
    }
    return;
  }
  process.env[key] = String(value);
  fileAppliedEnv.add(key);
}

/**
 * Load openexpert.json into process.env so the model provider (which reads the
 * environment) honours the file. Real environment variables always win. Safe to
 * call again after the file changes. Must run before secrets.json is loaded and
 * before the data dir is resolved.
 */
export function applyFileConfigToEnv(cwd: string = process.cwd()): void {
  const raw = readFileConfigRaw(cwd);
  assignFromFile("OPENEXPERT_MODEL_PROVIDER", raw.modelProvider);
  assignFromFile("OPENEXPERT_MODEL_ID", raw.modelId);
  assignFromFile("OLLAMA_BASE_URL", raw.ollamaBaseUrl);
  assignFromFile("OPENEXPERT_DATA_DIR", raw.dataDir);
  assignFromFile("OPENEXPERT_GOOGLE_CLIENT_ID", raw.googleClientId);
}

export function setRuntimeEnv(key: string, value: string | null): void {
  if (value === null || value === "") delete process.env[key];
  else process.env[key] = value;
}

/* ------------------------------- effective ------------------------------- */

export function effectiveConfig(cwd: string = process.cwd()): OpenExpertConfig {
  return loadConfig(cwd);
}

function fileHas(key: keyof RawFileConfig, cwd: string): boolean {
  const raw = readFileConfigRaw(cwd);
  return raw[key] !== undefined && raw[key] !== null && raw[key] !== "";
}

function secretSource(name: SecretName): ConfigSource {
  if (readSecrets()[name]) return "secrets";
  if (envAtBoot.has(name)) return "env";
  if (process.env[name]) return "env";
  return "default";
}

export function secretStatus(name: SecretName): { set: boolean; source: ConfigSource } {
  const set = Boolean(process.env[name] || readSecrets()[name]);
  return { set, source: set ? secretSource(name) : "default" };
}

export function revealSecretValue(name: SecretName): string | null {
  return process.env[name] ?? readSecrets()[name] ?? null;
}

export function aiSettings(cwd: string = process.cwd()): {
  provider: OpenExpertConfig["modelProvider"];
  providerSource: ConfigSource;
  modelId: string;
  modelIdSource: ConfigSource;
  ollamaBaseUrl: string;
  ollamaSource: ConfigSource;
  baseUrl: string;
  ai: AiConfig;
} {
  const cfg = effectiveConfig(cwd);
  const providerSource: ConfigSource = envAtBoot.has("OPENEXPERT_MODEL_PROVIDER")
    ? "env"
    : fileHas("modelProvider", cwd)
      ? "file"
      : "default";
  const modelIdSource: ConfigSource = envAtBoot.has("OPENEXPERT_MODEL_ID")
    ? "env"
    : fileHas("modelId", cwd)
      ? "file"
      : "default";
  const ollamaSource: ConfigSource = envAtBoot.has("OLLAMA_BASE_URL")
    ? "env"
    : fileHas("ollamaBaseUrl", cwd)
      ? "file"
      : "default";
  return {
    provider: cfg.modelProvider,
    providerSource,
    modelId: cfg.modelId,
    modelIdSource,
    ollamaBaseUrl: cfg.ollamaBaseUrl,
    ollamaSource,
    baseUrl: process.env["OPENEXPERT_BASE_URL"] ?? readSecrets()["OPENEXPERT_BASE_URL"] ?? "",
    ai: cfg.ai,
  };
}

export function chatSettings(cwd: string = process.cwd()): ChatConfig {
  return effectiveConfig(cwd).chat;
}

export function paths() {
  return {
    dataDir: dataDir(),
    config: configPath(),
    secrets: secretsPath(),
  };
}

/* --------------------------- advanced / diagnostics ---------------------- */

const ENV_KEYS = [
  "OPENEXPERT_MODEL_PROVIDER",
  "OPENEXPERT_MODEL_ID",
  "OLLAMA_BASE_URL",
  "OPENEXPERT_BASE_URL",
  "OPENEXPERT_DATA_DIR",
  "OPENEXPERT_MODEL_KEY",
  "OPENEXPERT_GATEWAY_URL",
  "OPENEXPERT_API_KEY",
  "OPENEXPERT_GOOGLE_CLIENT_ID",
  "OPENEXPERT_PRIVACY_URL",
  "GOOGLE_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_PICKER_API_KEY",
  "GOOGLE_PICKER_APP_ID",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_OAUTH_STATE_SECRET",
  "PUBLIC_APP_URL",
  "PORT",
] as const;

const SECRET_RE = /(KEY|SECRET|TOKEN|PASSWORD)/i;

export type EnvVarReport = {
  name: string;
  set: boolean;
  source: ConfigSource;
  secret: boolean;
  value?: string;
};

export function envReport(): EnvVarReport[] {
  const secrets = readSecrets();
  return ENV_KEYS.map((name) => {
    const value = process.env[name];
    const set = value !== undefined && value !== "";
    const source: ConfigSource = envAtBoot.has(name)
      ? "env"
      : fileAppliedEnv.has(name)
        ? "file"
        : secrets[name]
          ? "secrets"
          : set
            ? "env"
            : "default";
    const secret = SECRET_RE.test(name);
    return value !== undefined && !secret
      ? { name, set, source, secret, value }
      : { name, set, source, secret };
  });
}

export function diagnostics() {
  const cfg = effectiveConfig();
  const dir = dataDir();
  let writable = true;
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    writable = false;
  }
  const db = dbPath();
  let dbSize = 0;
  try {
    if (existsSync(db)) dbSize = statSync(db).size;
  } catch {
    dbSize = 0;
  }
  return {
    provider: cfg.modelProvider,
    modelId: cfg.modelId,
    googleConfigured: Boolean(
      (process.env["GOOGLE_CLIENT_ID"] || readSecrets()["GOOGLE_CLIENT_ID"]) &&
      (process.env["GOOGLE_CLIENT_SECRET"] || readSecrets()["GOOGLE_CLIENT_SECRET"]),
    ),
    dataDir: dir,
    dataDirWritable: writable,
    dbPath: db,
    dbSize,
    configExists: existsSync(configPath()),
    secretsExists: existsSync(secretsPath()),
  };
}

export function rawConfigText(cwd: string = process.cwd()): string {
  const raw = readFileConfigRaw(cwd);
  if (Object.keys(raw).length) return JSON.stringify(raw, null, 2);
  const cfg = effectiveConfig(cwd);
  return JSON.stringify(
    {
      $schema: "./packages/opencore/schema/openexpert.schema.json",
      modelProvider: cfg.modelProvider,
      modelId: cfg.modelId,
      ollamaBaseUrl: cfg.ollamaBaseUrl,
      dataDir: cfg.dataDir,
      ai: cfg.ai,
      chat: cfg.chat,
    },
    null,
    2,
  );
}

export const fileConfigSchema = z.object({
  $schema: z.string().optional(),
  modelProvider: z.enum(["google", "ollama", "openai-compatible"]).optional(),
  modelId: z.string().min(1).optional(),
  ollamaBaseUrl: z.string().optional(),
  dataDir: z.string().min(1).optional(),
  ai: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      maxOutputTokens: z.number().int().min(1).optional(),
    })
    .optional(),
  chat: z
    .object({
      maxSteps: z.number().int().min(1).optional(),
      injectionGuard: z.boolean().optional(),
      injectionExtraPatterns: z
        .array(z.string())
        .refine(patternsAreValid, { message: "Patrón regular inválido" })
        .optional(),
      retentionDays: z.number().int().min(0).optional(),
    })
    .optional(),
});

/** Parse and validate raw openexpert.json text. Throws on invalid input. */
export function parseRawConfig(text: string): RawFileConfig {
  const obj = JSON.parse(text) as unknown;
  return fileConfigSchema.parse(obj) as RawFileConfig;
}

/** Replace openexpert.json with validated content and re-apply the env bridge. */
export function writeRawConfig(text: string, cwd: string = process.cwd()): void {
  const parsed = parseRawConfig(text);
  atomicWrite(configPath(cwd), `${JSON.stringify(parsed, null, 2)}\n`);
  applyFileConfigToEnv(cwd);
}

/** Remove openexpert.json so the defaults apply again. */
export function resetFileConfig(cwd: string = process.cwd()): void {
  if (existsSync(configPath(cwd))) rmSync(configPath(cwd));
  applyFileConfigToEnv(cwd);
}

export const chatUpdateSchema = z.object({
  maxSteps: z.number().int().min(1).max(200),
  injectionGuard: z.boolean(),
  injectionExtraPatterns: z
    .array(z.string())
    .max(50)
    .refine(patternsAreValid, { message: "Patrón regular inválido" }),
  retentionDays: z.number().int().min(0).max(3650),
});

export type ChatUpdateInput = z.infer<typeof chatUpdateSchema>;

/* ------------------------------ validation ------------------------------ */

const urlOrEmpty = z
  .string()
  .trim()
  .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), { message: "URL no válida" });

export const aiUpdateSchema = z.object({
  provider: z.enum(["google", "ollama", "openai-compatible"]),
  modelId: z.string().trim().min(1).max(120),
  ollamaBaseUrl: urlOrEmpty,
  baseUrl: urlOrEmpty,
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  maxOutputTokens: z.number().int().min(1).max(200_000),
  // `undefined` leaves the stored key untouched; `""` clears it.
  googleApiKey: z.string().optional(),
  modelKey: z.string().optional(),
});

export type AiUpdateInput = z.infer<typeof aiUpdateSchema>;
