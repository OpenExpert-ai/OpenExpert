// SPDX-License-Identifier: MIT
// OpenExpert — local configuration.
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

/* ------------------------------- limits -------------------------------- */

/**
 * The limits that reach a billable provider call.
 *
 * `chat.maxSteps` becomes `stepCountIs`, so 100000 steps are 100000 billable
 * calls in a single request; `chat.retentionDays` drives the purge, so a huge
 * value switches the pruning off; `ai.maxOutputTokens` is the ceiling of the
 * tokens the model may generate in one turn.
 *
 * The panel and the raw editor already refuse to write a value above them
 * (`fileConfigSchema` in the app). These are the same numbers, and they are
 * enforced again **on read**, because that is the door every configuration
 * comes through: a file written by hand, a file from an older version (the
 * limits did not exist before) or a file that came from somewhere else.
 */
export const MAX_STEPS_LIMIT = 200;
export const RETENTION_DAYS_LIMIT = 3650;
export const MAX_OUTPUT_TOKENS_LIMIT = 200_000;

/**
 * How many injection patterns a configuration may carry.
 *
 * The panel's form caps the list at fifty, and every pattern is **measured**
 * against an adversarial input before it is used (`redos.server.ts`), so a
 * list of five thousand is not a list anybody wrote: it costs tens of seconds
 * of blocked thread on the first chat, and the panel is in the same process.
 */
export const MAX_INJECTION_PATTERNS = 50;

/** The smallest value each limit accepts. */
const MIN_STEPS = 1;
const MIN_RETENTION_DAYS = 0;
const MIN_OUTPUT_TOKENS = 1;

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

/**
 * Something that had to be brought back to a legal value when the
 * configuration was read.
 *
 * A limit broken in silence is a limit the owner does not know is broken: the
 * file says 100000 steps and the process runs with 200, and nothing says which
 * of the two is true. The notices are **data**, not a sentence: the panel
 * translates them and the CLI writes them in its own words, so the same read
 * serves both.
 */
export type ConfigNotice =
  /** A number that was outside its range. */
  | { kind: "limit"; field: string; value: number; limit: number }
  /** Injection patterns that were dropped because the list was too long. */
  | { kind: "patterns"; dropped: number; limit: number };

/**
 * Bring a number inside its range.
 *
 * A value that is not a number at all falls back to the default: that is what
 * `num` already does, and it is not a notice (a file without the field is not
 * a broken file). A value **inside** the range is left alone.
 */
function clamp(
  notices: ConfigNotice[],
  field: string,
  value: number,
  min: number,
  max: number,
): number {
  if (value < min) {
    notices.push({ kind: "limit", field, value, limit: min });
    return min;
  }
  if (value > max) {
    notices.push({ kind: "limit", field, value, limit: max });
    return max;
  }
  return value;
}

/**
 * The injection patterns of the file, capped at the panel's limit.
 *
 * The list is capped **before** it is used, and the number of dropped
 * patterns is reported: measuring a pattern is expensive (a list of five
 * thousand costs tens of seconds of blocked thread), and a pattern dropped in
 * silence is a pattern that is not being watched.
 */
function clampPatterns(notices: ConfigNotice[], patterns: string[]): string[] {
  if (patterns.length <= MAX_INJECTION_PATTERNS) return patterns;
  notices.push({
    kind: "patterns",
    dropped: patterns.length - MAX_INJECTION_PATTERNS,
    limit: MAX_INJECTION_PATTERNS,
  });
  return patterns.slice(0, MAX_INJECTION_PATTERNS);
}

/** A configuration and what had to be brought back to a legal value to read it. */
export type LoadedConfig = {
  config: OpenExpertConfig;
  notices: ConfigNotice[];
};

/**
 * Read `openexpert.json` and apply the limits.
 *
 * This is the door every configuration comes through: the application and the
 * CLI both read the file through it, so a value that is out of range is
 * brought back to a legal one whichever of them is running. The notices say
 * what was changed, so the owner is not left with a file that says one thing
 * and a process that does another.
 */
export function loadConfigWithNotices(cwd: string = process.cwd()): LoadedConfig {
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

  const notices: ConfigNotice[] = [];
  const maxSteps = clamp(
    notices,
    "chat.maxSteps",
    num(fileChat.maxSteps, DEFAULTS.chat.maxSteps),
    MIN_STEPS,
    MAX_STEPS_LIMIT,
  );
  const retentionDays = clamp(
    notices,
    "chat.retentionDays",
    num(fileChat.retentionDays, DEFAULTS.chat.retentionDays),
    MIN_RETENTION_DAYS,
    RETENTION_DAYS_LIMIT,
  );
  const maxOutputTokens = clamp(
    notices,
    "ai.maxOutputTokens",
    num(fileAi.maxOutputTokens, DEFAULTS.ai.maxOutputTokens),
    MIN_OUTPUT_TOKENS,
    MAX_OUTPUT_TOKENS_LIMIT,
  );
  const patterns = Array.isArray(fileChat.injectionExtraPatterns)
    ? fileChat.injectionExtraPatterns.filter((p): p is string => typeof p === "string")
    : DEFAULTS.chat.injectionExtraPatterns;
  const injectionExtraPatterns = clampPatterns(notices, patterns);

  return {
    notices,
    config: {
      modelProvider: provider,
      modelId:
        env["OPENEXPERT_MODEL_ID"] ??
        file.modelId ??
        (defaultModelOf(provider) || DEFAULTS.modelId),
      ollamaBaseUrl: env["OLLAMA_BASE_URL"] ?? file.ollamaBaseUrl ?? DEFAULTS.ollamaBaseUrl,
      dataDir: expandHome(env["OPENEXPERT_DATA_DIR"] ?? file.dataDir ?? DEFAULTS.dataDir),
      googleClientId:
        env["OPENEXPERT_GOOGLE_CLIENT_ID"] ?? file.googleClientId ?? DEFAULTS.googleClientId,
      notionClientId:
        env["OPENEXPERT_NOTION_CLIENT_ID"] ?? file.notionClientId ?? DEFAULTS.notionClientId,
      ai: {
        temperature: num(fileAi.temperature, DEFAULTS.ai.temperature),
        topP: num(fileAi.topP, DEFAULTS.ai.topP),
        maxOutputTokens,
      },
      chat: {
        maxSteps,
        injectionGuard: fileChat.injectionGuard ?? DEFAULTS.chat.injectionGuard,
        visionPdf: fileChat.visionPdf ?? DEFAULTS.chat.visionPdf,
        injectionExtraPatterns,
        retentionDays,
      },
    },
  };
}

/**
 * Read `openexpert.json` with the limits applied.
 *
 * The notices are left out on purpose: a caller that only wants the values
 * does not have to think about them, and one that has to say something reads
 * them with `loadConfigWithNotices`.
 */
export function loadConfig(cwd: string = process.cwd()): OpenExpertConfig {
  return loadConfigWithNotices(cwd).config;
}
