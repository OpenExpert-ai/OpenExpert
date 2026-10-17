// SPDX-License-Identifier: MIT
// OpenCore — the provider catalogue. A provider is data, not a branch.
//
// Adding one is a record in this list: no type to widen, no factory to touch,
// no validation to remember. That is the whole point. The shape follows the
// provider registry Hermes reads (id, env, adapter, api, models) and the model
// records carry the same metadata: name, cost, limits, tool calling, reasoning.
//
// Four fields deserve a word because they are not obvious:
//   - `env` names the variable that holds the key, and **no two records may
//     share one**. It is the single source of truth for where a provider's
//     credential comes from — `keySourceOf` is read off the catalogue instead
//     of being a second list to keep in step — and a shared name would mean
//     writing one provider's key silently destroys another's. A test enforces
//     the uniqueness, because the failure is invisible until the other
//     provider stops authenticating.
//   - `baseUrlEnv` names the variable holding an endpoint the **user**
//     provides (Ollama's URL, a generic OpenAI-compatible base). A record with
//     a fixed `baseUrl` does not need it, and print it only when it is absent.
//   - `sessionHeader` names a header that must carry the conversation id on
//     every request to that provider. Off unless a provider declares it. A
//     gateway that routes per conversation refuses a request without it.
//   - `keyUrl`, `note` and `baseUrlHint` are what the settings screen shows.
//     They live here, next to the record they describe, so the panel walks the
//     catalogue and keeps no provider list of its own.

export type ProviderAdapter = "google" | "openai-compatible" | "anthropic";

/** Where a local Ollama listens unless the owner says otherwise. */
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/** Cost in US dollars per million tokens, as published by the provider. */
export type ModelCost = { input: number; output: number; cacheRead?: number };

export type ModelDef = {
  id: string;
  /** Human name, for the picker. Falls back to the id when absent. */
  name?: string;
  toolCall?: boolean;
  reasoning?: boolean;
  cost?: ModelCost;
  limit?: { context?: number; output?: number };
};

export type ProviderDef = {
  id: string;
  name: string;
  adapter: ProviderAdapter;
  /** Endpoint. Absent for providers whose URL the user provides, and for Google, which uses its adapter's. */
  baseUrl?: string;
  /** Environment variable holding the key. Absent when no key is needed. */
  env?: string;
  /** Environment variable holding the endpoint, for providers the user points somewhere. */
  baseUrlEnv?: string;
  /** Endpoint used when `baseUrlEnv` is unset. Only for providers with a well-known default. */
  baseUrlDefault?: string;
  /** Where the owner gets a key. Shown next to the key field. */
  keyUrl?: string;
  /** One line for the picker: what this provider is and what using it implies. */
  note?: string;
  /** Help under the endpoint field. */
  baseUrlHint?: string;
  /** Extra headers sent with every request to this provider. */
  headers?: Record<string, string>;
  /** Header that must carry the conversation id, for session-aware gateways. */
  sessionHeader?: string;
  /** Models known to work. An empty list means "ask the endpoint". */
  models: ModelDef[];
};

/**
 * The catalogue.
 *
 * Only what has been checked is here. A model with no cost or limit recorded is
 * one whose figures have not been verified — the endpoint or the model cache
 * fills them in — rather than one that costs nothing.
 *
 * Deliberately absent: GitHub Copilot, because its terms provide the service
 * through its own extensions and using it elsewhere is very likely a breach;
 * and the Nous portal, whose access is an OAuth account rather than an API key.
 */
export const PROVIDERS = [
  {
    id: "ollama",
    name: "Ollama (local)",
    adapter: "openai-compatible",
    baseUrlEnv: "OLLAMA_BASE_URL",
    baseUrlDefault: DEFAULT_OLLAMA_URL,
    baseUrlHint: "Acepta la raíz nativa o la URL /v1: se normaliza.",
    note: "Local y sin claves: nada sale de tu equipo.",
    models: [{ id: "llama3.1", name: "Llama 3.1" }],
  },
  {
    id: "google",
    name: "Google Gemini",
    adapter: "google",
    env: "GOOGLE_API_KEY",
    keyUrl: "https://aistudio.google.com/apikey",
    note: "Clave gratuita de AI Studio. Los datos salen a Google.",
    models: [{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", toolCall: true, reasoning: true }],
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    adapter: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    env: "ANTHROPIC_API_KEY",
    keyUrl: "https://console.anthropic.com/settings/keys",
    note: "Modelos Claude. Su clave es independiente de la de los demás.",
    // Seeds for the picker. The provider's own `/models` endpoint is the truth;
    // `listProviderModels` reads it, so an id that ages out is still reachable.
    models: [
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", toolCall: true, reasoning: true },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", toolCall: true, reasoning: true },
    ],
  },
  {
    id: "openai-compatible",
    name: "Compatible con OpenAI (BYOK)",
    adapter: "openai-compatible",
    env: "OPENEXPERT_MODEL_KEY",
    baseUrlEnv: "OPENEXPERT_BASE_URL",
    baseUrlHint: "Endpoint compatible con OpenAI, con /v1 al final.",
    note: "Tu propio endpoint. Los datos salen a donde apuntes.",
    models: [],
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    adapter: "openai-compatible",
    baseUrl: "https://opencode.ai/zen/go/v1",
    env: "OPENCODE_GO_API_KEY",
    sessionHeader: "x-opencode-session",
    note: "Solo este proveedor manda la cabecera de sesión que su servicio pide.",
    models: [
      { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", toolCall: true, reasoning: true },
    ],
  },
] as const satisfies readonly ProviderDef[];

export type ModelProviderId = (typeof PROVIDERS)[number]["id"];

/**
 * A catalogue record as the rest of the program reads it: the declared shape,
 * with `env` narrowed to a name the catalogue actually uses. The assertion is
 * what buys that — the records are `as const`, so their `env` are literals, and
 * the narrowing is what lets a caller write `secretStatus(record.env)` without
 * casting at every call site.
 */
export type CatalogueRecord = ProviderDef & { env?: ProviderKeyVar };

export function providerCatalogue(): readonly CatalogueRecord[] {
  return PROVIDERS as readonly CatalogueRecord[];
}

/** The records that hold a key: the ones that declare where it lives. */
type ProviderWithEnv = Extract<(typeof PROVIDERS)[number], { env: string }>;

/** Every variable the catalogue uses to hold a provider key, derived from it. */
export type ProviderKeyVar = ProviderWithEnv["env"];

export function isProviderId(value: unknown): value is ModelProviderId {
  return typeof value === "string" && PROVIDERS.some((p) => p.id === value);
}

export function providerDef(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Provider ids, as a tuple for `z.enum`. A test pins that it is never empty. */
export const PROVIDER_IDS = PROVIDERS.map((p) => p.id) as unknown as readonly [
  ModelProviderId,
  ...ModelProviderId[],
];

/** The variable that holds a provider's key, when its record keeps one. */
export function providerKeyEnvOf(id: string): ProviderKeyVar | undefined {
  return providerCatalogue().find((p) => p.id === id)?.env;
}

/** Where a provider's key lives, without exposing its value. */
export function keySourceOf(id: ModelProviderId): string {
  const env = providerDef(id)?.env;
  return env ? env : "none (local)";
}

/** Where a provider's endpoint comes from when the user provides it. */
export function endpointSourceOf(id: ModelProviderId): string | undefined {
  return providerDef(id)?.baseUrlEnv;
}

/**
 * The endpoint to talk to: the record's own when it has one, otherwise the
 * value the owner stored under the variable the record names, otherwise the
 * default the record declares (Ollama's local port).
 */
export function endpointOf(
  id: ModelProviderId,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const def = providerDef(id);
  if (!def) return undefined;
  if (def.baseUrl) return def.baseUrl;
  if (!def.baseUrlEnv) return undefined;
  return env[def.baseUrlEnv] || def.baseUrlDefault;
}

/** Providers reached with a key of their own. */
export const BYOK_PROVIDERS: readonly ModelProviderId[] = PROVIDERS.filter(
  (p): p is ProviderWithEnv => "env" in p,
).map((p) => p.id);

/** The variables holding provider keys, in catalogue order. */
export const PROVIDER_KEY_VARS: readonly ProviderKeyVar[] = PROVIDERS.filter(
  (p): p is ProviderWithEnv => "env" in p,
).map((p) => p.env);

export function defaultModelOf(id: ModelProviderId): string {
  return providerDef(id)?.models[0]?.id ?? "";
}
