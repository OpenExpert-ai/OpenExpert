// SPDX-License-Identifier: MIT
// OpenCore — which model to use. The harness is stable; the model is configuration.
//
// Providers:
import {
  defaultModelOf,
  isProviderId,
  keySourceOf,
  providerDef,
  type ModelProviderId,
  type ProviderDef,
} from "./providers.js";

export {
  BYOK_PROVIDERS,
  defaultModelOf,
  endpointOf,
  endpointSourceOf,
  isProviderId,
  keySourceOf,
  providerCatalogue,
  providerKeyEnvOf,
  PROVIDER_IDS,
  PROVIDER_KEY_VARS,
  PROVIDERS,
  providerDef,
} from "./providers.js";
export type {
  CatalogueRecord,
  ModelDef,
  ModelProviderId,
  ProviderAdapter,
  ProviderDef,
  ProviderKeyVar,
} from "./providers.js";

export type ModelSelection = {
  provider: ModelProviderId;
  modelId: string;
  /** Where the key comes from, read off the catalogue, without exposing it. */
  keySource: string;
};

export function selectModel(env: NodeJS.ProcessEnv = process.env): ModelSelection {
  const raw = env["OPENEXPERT_MODEL_PROVIDER"];
  const provider: ModelProviderId = isProviderId(raw) ? raw : "google";
  return {
    provider,
    modelId: env["OPENEXPERT_MODEL_ID"] || defaultModelOf(provider),
    keySource: keySourceOf(provider),
  };
}

/**
 * Ollama exposes two surfaces: the native API at the server root (`/api/*`)
 * and an OpenAI-compatible API under `/v1`. Callers may configure either
 * shape, so normalise before using it.
 *
 * Trailing slashes are removed with a loop, not with `/\/+$/`: a regex has to
 * retry at every position of a long run of slashes, which is what CodeQL
 * reports as a polynomial ReDoS on `baseUrl`.
 */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

export function ollamaApiBaseUrl(baseUrl: string): string {
  const base = stripTrailingSlashes(baseUrl.trim());
  return base.endsWith("/v1") ? base.slice(0, -3) : base;
}

export function ollamaChatBaseUrl(baseUrl: string): string {
  return `${ollamaApiBaseUrl(baseUrl)}/v1`;
}

/**
 * The message for a provider whose key is not set, or null when nothing is
 * missing. Read off the catalogue: whichever variable a record declares is the
 * one that has to carry a value, so a new provider needs no new branch here.
 */
export function providerKeyMessage(
  def: ProviderDef,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!def.env) return null;
  return env[def.env] ? null : `Falta ${def.env} para ${def.name}.`;
}

export function missingKeyHint(
  sel: ModelSelection,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const def = providerDef(sel.provider);
  return def ? providerKeyMessage(def, env) : null;
}
