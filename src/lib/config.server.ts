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
import {
  providerCatalogue,
  PROVIDER_IDS,
  PROVIDER_KEY_VARS,
  providerDef,
  type ProviderKeyVar,
} from "@openexpert/opencore/model-provider";
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

/**
 * Every secret the panel can read or write. The provider keys are **derived
 * from the catalogue** (`ProviderKeyVar`), so a provider added there is a secret
 * this panel already knows how to store — and there is no second list of key
 * names to keep in step with it.
 */
export type SecretName =
  | ProviderKeyVar
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "GOOGLE_PICKER_API_KEY"
  | "OPENEXPERT_BASE_URL"
  | "NOTION_CLIENT_SECRET";

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

/** Keys whose current value in process.env came from openexpert.json, and the
 * exact value we wrote. A runtime change (tests, CLI) makes it a "real" env
 * var and the file must stop overriding it. */
const fileAppliedEnv = new Map<string, string>();

function assignFromFile(key: string, value: unknown): void {
  // A real environment variable always wins: one present at boot, or one
  // changed at runtime since the file was last applied.
  if (envAtBoot.has(key)) return;
  const applied = fileAppliedEnv.get(key);
  const current = process.env[key];
  if (current !== undefined && current !== applied) return;
  if (value === undefined || value === null || value === "") {
    if (applied !== undefined) {
      delete process.env[key];
      fileAppliedEnv.delete(key);
    }
    return;
  }
  process.env[key] = String(value);
  fileAppliedEnv.set(key, String(value));
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
  assignFromFile("OPENEXPERT_NOTION_CLIENT_ID", raw.notionClientId);
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

/**
 * Where the value the app is using comes from. A real environment variable
 * wins over the stored file — that is what `revealSecretValue` returns — so the
 * label follows the same order, or the panel would say "saved in secrets.json"
 * while the process was using something else. A variable that exists in the
 * environment with **exactly** the stored value is the copy the app itself
 * loaded from the file (`loadSecretsIntoEnv`), and calling that "environment"
 * would send the owner looking for a variable that is not there.
 */
function secretSource(name: SecretName): ConfigSource {
  const stored = readSecrets()[name];
  const live = process.env[name];
  if (envAtBoot.has(name) && live !== stored) return "env";
  if (stored) return "secrets";
  if (live) return "env";
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

/**
 * Store the endpoint a provider's owner typed. The local server's URL is
 * configuration — it lives in `openexpert.json`, mapped to its variable by
 * `applyFileConfigToEnv` — while any other user-supplied endpoint is a secret
 * and goes to `secrets.json`. One place decides that, and it is this one.
 */
export function writeProviderEndpoint(variable: string, value: string): void {
  if (variable === "OLLAMA_BASE_URL") {
    writeFileConfig({ ollamaBaseUrl: value });
    return;
  }
  writeSecret(variable, value === "" ? null : value);
}

/* ------------------------------ provider view ---------------------------- */

export type ProviderEndpointView = {
  /** The address the record brings, when it has its own. */
  fixed: string | null;
  /** Variable the owner writes it to, when the endpoint is theirs. */
  env: string | null;
  /** What is stored right now (what the panel edits). */
  value: string;
  /** What the model layer will use. */
  inUse: string;
  /** The record's default, when the variable is empty. */
  fallback: string | null;
};

export type ProviderView = {
  id: string;
  name: string;
  adapter: string;
  note: string | null;
  keyUrl: string | null;
  baseUrlHint: string | null;
  /** null when the provider needs no key (a local model). */
  key: { name: ProviderKeyVar; set: boolean; source: ConfigSource } | null;
  endpoint: ProviderEndpointView;
  /** Headers the service requires; shown so the user knows what travels. */
  sessionHeader: string | null;
  /** Ids the catalogue already knows, to seed the model picker. */
  models: string[];
};

/**
 * What the settings panel renders, one entry per catalogue record. Built here,
 * next to the files it reads, so the interface holds no provider list and no
 * second idea of where a key or an endpoint lives.
 */
export function providerViews(cwd: string = process.cwd()): ProviderView[] {
  const cfg = effectiveConfig(cwd);
  const secrets = readSecrets();
  return providerCatalogue().map((def) => {
    const endpointEnv = def.baseUrlEnv;
    const envValue = endpointEnv ? process.env[endpointEnv] : undefined;
    // Ollama's endpoint is configuration, not a secret, so the panel edits the
    // value in openexpert.json; every other user-supplied endpoint is stored as
    // a secret. Either way the panel is told what is in use.
    const stored =
      def.id === "ollama"
        ? (envValue ?? cfg.ollamaBaseUrl ?? "")
        : (envValue ?? (endpointEnv ? secrets[endpointEnv] : undefined) ?? "");
    const key = def.env ? { name: def.env, ...secretStatus(def.env) } : null;
    return {
      id: def.id,
      name: def.name,
      adapter: def.adapter,
      note: def.note ?? null,
      keyUrl: def.keyUrl ?? null,
      baseUrlHint: def.baseUrlHint ?? null,
      key,
      endpoint: {
        fixed: def.baseUrl ?? null,
        env: endpointEnv ?? null,
        value: stored,
        inUse: def.baseUrl ?? envValue ?? (endpointEnv ? stored || def.baseUrlDefault || "" : ""),
        fallback: def.baseUrlDefault ?? null,
      },
      sessionHeader: def.sessionHeader ?? null,
      models: def.models.map((m) => m.id),
    };
  });
}

/* --------------------------- advanced / diagnostics ---------------------- */

const ENV_KEYS: readonly string[] = [
  "OPENEXPERT_MODEL_PROVIDER",
  "OPENEXPERT_MODEL_ID",
  "OLLAMA_BASE_URL",
  "OPENEXPERT_BASE_URL",
  "OPENEXPERT_DATA_DIR",
  // One variable per provider, read off the catalogue (it holds its uniqueness).
  ...PROVIDER_KEY_VARS,
  "OPENEXPERT_GOOGLE_CLIENT_ID",
  "OPENEXPERT_PRIVACY_URL",
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
  modelProvider: z.enum(PROVIDER_IDS).optional(),
  modelId: z.string().min(1).optional(),
  ollamaBaseUrl: z.string().optional(),
  dataDir: z.string().min(1).optional(),
  googleClientId: z.string().optional(),
  notionClientId: z.string().optional(),
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
      visionPdf: z.boolean().optional(),
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
  // Off by default: a scanned PDF read with a model means the document leaves the machine, and
  // that is a decision for its owner, not a default.
  visionPdf: z.boolean().default(false),
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
  // The list of providers is the catalogue's, not a copy: choosing any record
  // from the panel saves, and one no record claims is rejected.
  provider: z.enum(PROVIDER_IDS),
  modelId: z.string().trim().min(1).max(120),
  /** Endpoint of the selected provider, when its record says the user sets it. */
  endpoint: urlOrEmpty,
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  maxOutputTokens: z.number().int().min(1).max(200_000),
  /**
   * Keys to write, **by provider id**: each one lands in the variable that
   * provider's record declares, so saving the key of one provider never touches
   * another's. Older than the provider map is not: a request naming a provider
   * the catalogue does not know, or one that keeps no key, is rejected instead
   * of silently dropped.
   */
  providerKeys: z
    .record(z.string(), z.string().max(4096))
    .refine((keys) => Object.keys(keys).every((id) => Boolean(providerDef(id)?.env)), {
      message: "Ese proveedor no guarda ninguna clave",
    })
    .optional(),
});

export type AiUpdateInput = z.infer<typeof aiUpdateSchema>;
