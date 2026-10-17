// SPDX-License-Identifier: MIT
// OpenCore — the provider catalogue. A provider is data, not a branch.
//
// Adding one is a record in this list: no type to widen, no factory to touch,
// no validation to remember. That is the whole point. The shape follows the
// provider registry Hermes reads (id, env, adapter, api, models) and the model
// records carry the same metadata: name, cost, limits, tool calling, reasoning.
//
// Two fields deserve a word because they are not obvious:
//   - `env` names the variable that holds the key. It is the single source of
//     truth for where a provider's credential comes from, so `keySource` is
//     read off the catalogue instead of being a second list to keep in step.
//   - `sessionHeader` names a header that must carry the conversation id on
//     every request to that provider. Off unless a provider declares it. A
//     gateway that routes per conversation refuses a request without it.

export type ProviderAdapter = "google" | "openai-compatible" | "anthropic";

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
  /** Endpoint. Absent for local providers, which are configured by the user. */
  baseUrl?: string;
  /** Environment variable holding the key. Absent when no key is needed. */
  env?: string;
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
    id: "google",
    name: "Google Gemini",
    adapter: "google",
    env: "GOOGLE_API_KEY",
    models: [{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", toolCall: true, reasoning: true }],
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    adapter: "openai-compatible",
    models: [{ id: "llama3.1", name: "Llama 3.1" }],
  },
  {
    id: "openai-compatible",
    name: "Compatible con OpenAI (BYOK)",
    adapter: "openai-compatible",
    env: "OPENEXPERT_MODEL_KEY",
    models: [],
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    adapter: "openai-compatible",
    baseUrl: "https://opencode.ai/zen/go/v1",
    env: "OPENEXPERT_MODEL_KEY",
    sessionHeader: "x-opencode-session",
    models: [
      { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", toolCall: true, reasoning: true },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    adapter: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    env: "ANTHROPIC_API_KEY",
    models: [],
  },
] as const satisfies readonly ProviderDef[];

export type ModelProviderId = (typeof PROVIDERS)[number]["id"];

export function providerDef(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Where a provider's key lives, without exposing its value. */
export function keySourceOf(id: ModelProviderId): string {
  const env = (providerDef(id) as ProviderDef | undefined)?.env;
  return env ? env : "none (local)";
}

/** Providers reached over an OpenAI-compatible endpoint with a key of their own. */
export const BYOK_PROVIDERS: ModelProviderId[] = PROVIDERS.filter(
  (p) => "env" in p && p.env !== undefined,
).map((p) => p.id);

export function defaultModelOf(id: ModelProviderId): string {
  return providerDef(id)?.models[0]?.id ?? "";
}
