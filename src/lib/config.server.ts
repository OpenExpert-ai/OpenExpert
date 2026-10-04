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

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { loadConfig } from "@openexpert/opencore/config";
import type { AiConfig, ChatConfig, OpenExpertConfig } from "@openexpert/opencore/config";
import { configPath, dataDir, secretsPath } from "./paths.server";

export type ConfigSource = "env" | "file" | "secrets" | "default";

/** Environment variables that existed before we loaded openexpert.json/secrets. */
const envAtBoot = new Set(Object.keys(process.env));

export type SecretName =
  | "GOOGLE_API_KEY"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
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

function setEnvIfAbsent(key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  if (!process.env[key]) process.env[key] = String(value);
}

/**
 * Load openexpert.json into process.env so the model provider (which reads the
 * environment) honours the file. Real environment variables always win. Must
 * run before secrets.json is loaded and before the data dir is resolved.
 */
export function applyFileConfigToEnv(cwd: string = process.cwd()): void {
  const raw = readFileConfigRaw(cwd);
  setEnvIfAbsent("OPENEXPERT_MODEL_PROVIDER", raw.modelProvider);
  setEnvIfAbsent("OPENEXPERT_MODEL_ID", raw.modelId);
  setEnvIfAbsent("OLLAMA_BASE_URL", raw.ollamaBaseUrl);
  setEnvIfAbsent("OPENEXPERT_DATA_DIR", raw.dataDir);
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
