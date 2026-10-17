// SPDX-License-Identifier: MIT
// OpenCore — asking a provider which models it serves.
//
// One entry point for every surface that needs the answer: the settings panel
// ("Listar" / "Probar conexión") and `opencore models` / `opencore doctor`.
// Each adapter knows its own protocol and the catalogue says where that
// provider's key and endpoint live, so no list of providers is repeated here.
//
// A failure is never silent: when the endpoint cannot be asked, the answer
// carries the models the catalogue already knows plus the reason, so the caller
// can keep offering a choice and say what went wrong.

import { ollamaApiBaseUrl, providerKeyMessage, stripTrailingSlashes } from "./model-provider.js";
import { endpointOf, providerDef, type ModelProviderId, type ProviderDef } from "./providers.js";

export type ModelList = {
  ok: boolean;
  models: string[];
  /** Whether the list came from the provider or from the catalogue. */
  source: "endpoint" | "catalogue";
  error?: string;
};

const GOOGLE_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Anthropic pins its protocol with a date, and asks for the key in its own
 * header. Both are the adapter's business, not a provider's: this is the shape
 * of the Messages API, not a preference of one record.
 */
const ANTHROPIC_VERSION = "2023-06-01";

type ListOptions = {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function fallback(def: ProviderDef, error: string): ModelList {
  return { ok: false, models: def.models.map((m) => m.id), source: "catalogue", error };
}

async function googleModels(key: string, o: Required<ListOptions>): Promise<ModelList> {
  const res = await o.fetchImpl(`${GOOGLE_MODELS_URL}?key=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(o.timeoutMs),
  });
  if (!res.ok)
    return { ok: false, models: [], source: "endpoint", error: `Google respondió ${res.status}` };
  const json = (await res.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };
  const models = (json.models ?? [])
    // An embedding model is not a chat model: offer only what can answer.
    .filter(
      (m) =>
        !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"),
    )
    .map((m) => m.name.replace(/^models\//, ""));
  return { ok: true, models, source: "endpoint" };
}

async function anthropicModels(
  key: string,
  baseUrl: string,
  o: Required<ListOptions>,
): Promise<ModelList> {
  const res = await o.fetchImpl(`${stripTrailingSlashes(baseUrl)}/models?limit=100`, {
    headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION },
    signal: AbortSignal.timeout(o.timeoutMs),
  });
  if (!res.ok)
    return {
      ok: false,
      models: [],
      source: "endpoint",
      error: `Anthropic respondió ${res.status}`,
    };
  const json = (await res.json()) as { data?: { id: string }[] };
  return { ok: true, models: (json.data ?? []).map((m) => m.id), source: "endpoint" };
}

async function openAiModels(
  key: string,
  baseUrl: string,
  o: Required<ListOptions>,
): Promise<ModelList> {
  const res = await o.fetchImpl(`${stripTrailingSlashes(baseUrl)}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(o.timeoutMs),
  });
  if (!res.ok)
    return {
      ok: false,
      models: [],
      source: "endpoint",
      error: `El endpoint respondió ${res.status}`,
    };
  const json = (await res.json()) as { data?: { id: string }[] };
  return { ok: true, models: (json.data ?? []).map((m) => m.id), source: "endpoint" };
}

async function ollamaModels(baseUrl: string, o: Required<ListOptions>): Promise<ModelList> {
  const res = await o.fetchImpl(`${ollamaApiBaseUrl(baseUrl)}/api/tags`, {
    signal: AbortSignal.timeout(o.timeoutMs),
  });
  if (!res.ok)
    return { ok: false, models: [], source: "endpoint", error: `Ollama respondió ${res.status}` };
  const json = (await res.json()) as { models?: { name: string }[] };
  return { ok: true, models: (json.models ?? []).map((m) => m.name), source: "endpoint" };
}

/**
 * Which models the provider serves. `endpoint` overrides the stored URL, so the
 * settings panel can ask about an endpoint the user has typed but not yet saved.
 * Trailing slashes are trimmed with the shared helper: the URL comes from the
 * owner, and a regex on the outside's data is a CodeQL finding waiting to happen.
 */
export async function listProviderModels(
  id: ModelProviderId,
  opts: ListOptions & { endpoint?: string } = {},
): Promise<ModelList> {
  const def = providerDef(id);
  if (!def)
    return { ok: false, models: [], source: "catalogue", error: `Proveedor desconocido: ${id}` };
  const o: Required<ListOptions> = {
    env: opts.env ?? process.env,
    timeoutMs: opts.timeoutMs ?? 6000,
    fetchImpl: opts.fetchImpl ?? fetch,
  };
  const baseUrl = opts.endpoint || endpointOf(id, o.env);

  const missingKey = providerKeyMessage(def, o.env);
  if (missingKey) return fallback(def, missingKey);

  if (id === "ollama") {
    // Defensive: a local server's endpoint resolves through the record's own
    // default, so this cannot be empty — but the value comes from a variable the
    // owner can edit, and asking a nameless address is worse than saying so.
    if (!baseUrl) return fallback(def, `Falta la dirección de ${def.name}.`);
    try {
      return await ollamaModels(baseUrl, o);
    } catch (e) {
      return fallback(def, `No se pudo contactar con Ollama: ${(e as Error).message}`);
    }
  }

  if (!baseUrl && def.adapter !== "google") {
    return fallback(def, `Falta la dirección de ${def.name}.`);
  }

  // The check above is what makes this hold: the record declares a variable and
  // it carries a value, so there is nothing left to fall back to here.
  const key = o.env[def.env!]!;
  try {
    if (def.adapter === "google") return await googleModels(key, o);
    if (def.adapter === "anthropic") return await anthropicModels(key, baseUrl as string, o);
    return await openAiModels(key, baseUrl as string, o);
  } catch (e) {
    return fallback(def, `No se pudo preguntar a ${def.name}: ${(e as Error).message}`);
  }
}
