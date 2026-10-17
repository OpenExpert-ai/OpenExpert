// SPDX-License-Identifier: MIT
// Server-side model provider selection, built on @openexpert/opencore.
//
// One branch per adapter, and the catalogue record decides which one runs,
// where the key lives and which endpoint to use. A provider whose key is
// missing says so naming **its own** variable: borrowing another provider's key
// looks like a working configuration right up to the first 401.

import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  endpointOf,
  missingKeyHint,
  ollamaChatBaseUrl,
  providerCatalogue,
  providerDef,
  selectModel,
  type ModelProviderId,
  type ProviderDef,
} from "@openexpert/opencore/model-provider";

export type { ModelProviderId };

export function selectedProvider(): ModelProviderId {
  return selectModel().provider;
}

export function selectedModelId(): string {
  return selectModel().modelId;
}

export function modelKeyError(): string | null {
  return missingKeyHint(selectModel());
}

/**
 * Headers a session-aware provider asks for, read off its record. A gateway
 * that routes per conversation refuses a request without a session id — it
 * answers 400 and says so — so the header travels with the provider that
 * declares it and with no other.
 */
export function providerHeaders(def: ProviderDef, sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "user-agent": `OpenExpert/${process.env["npm_package_version"] || "dev"}`,
  };
  if (sessionId && def.sessionHeader) headers[def.sessionHeader] = sessionId;
  return headers;
}

/** The record for the active provider, falling back to the first one. */
function activeDef(): ProviderDef {
  return providerDef(selectModel().provider) ?? providerCatalogue()[0]!;
}

/** A provider's own key, or the reason it cannot be used. */
function keyOf(def: ProviderDef): string {
  const value = def.env ? process.env[def.env] : undefined;
  if (!value) throw new Error(`Falta ${def.env ?? "la clave"} para ${def.name}.`);
  return value;
}

export function getLanguageModel(sessionId?: string): LanguageModel {
  const sel = selectModel();
  const id = sel.modelId;
  const def = activeDef();

  if (def.adapter === "google") {
    return createGoogleGenerativeAI({ apiKey: keyOf(def) })(id);
  }

  if (def.adapter === "anthropic") {
    // The record's own endpoint, with the protocol version pinned by its adapter.
    return createAnthropic({
      apiKey: keyOf(def),
      ...(def.baseUrl ? { baseURL: def.baseUrl } : {}),
      ...(def.headers ? { headers: def.headers } : {}),
    })(id);
  }

  // OpenAI-compatible: local (Ollama) or remote. The endpoint is the record's
  // own or the one its owner stored; a local server needs no key.
  const endpoint = endpointOf(sel.provider);
  if (!endpoint) throw new Error(`Falta ${def.baseUrlEnv ?? "la dirección"} para ${def.name}.`);

  if (sel.provider === "ollama") {
    return createOpenAI({ apiKey: "ollama", baseURL: ollamaChatBaseUrl(endpoint) })(id);
  }

  const headers = providerHeaders(def, sessionId);
  return createOpenAI({
    apiKey: keyOf(def),
    baseURL: endpoint,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const merged = new Headers(init?.headers);
      for (const [name, value] of Object.entries(headers)) merged.set(name, value);
      return fetch(input, { ...init, headers: merged });
    },
  })(id);
}

export function modelLabel(): string {
  return `${selectedProvider()}:${selectedModelId()}`;
}
