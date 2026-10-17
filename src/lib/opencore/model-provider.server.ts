// SPDX-License-Identifier: MIT
// Server-side model provider selection, built on @openexpert/opencore.
// Providers: google (Gemini free key), ollama (local), openai-compatible (BYOK).

import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  missingKeyHint,
  ollamaChatBaseUrl,
  providerDef,
  selectModel,
  type ModelProviderId,
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
 * Name of the session header some OpenAI-compatible gateways require to route a
 * conversation. It is a protocol name, not a product opinion: it goes in exactly
 * one place, here, so it is easy to audit.
 */
const SESSION_HEADER = "x-opencode-session";

/**
 * Headers this gateway asks for, and only this one. It routes by client and
 * refuses a request that carries no session id — it answers 400 and says so —
 * so both travel together and nowhere else. An endpoint that asks for neither
 * never sees them: this is the provider that needs them, not the generic one.
 */
export function opencodeGoHeaders(sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "user-agent": `OpenExpert/${process.env["npm_package_version"] || "dev"}`,
  };
  if (sessionId) headers[SESSION_HEADER] = sessionId;
  return headers;
}

export function getLanguageModel(sessionId?: string): LanguageModel {
  const sel = selectModel();
  const id = sel.modelId;
  const def = providerDef(sel.provider);
  if (sel.provider === "ollama") {
    const baseURL = ollamaChatBaseUrl(process.env["OLLAMA_BASE_URL"] || "http://localhost:11434");
    return createOpenAI({ apiKey: "ollama", baseURL })(id);
  }
  if (sel.provider === "openai-compatible") {
    const baseURL = process.env["OPENEXPERT_BASE_URL"];
    if (!baseURL) throw new Error("Falta OPENEXPERT_BASE_URL");
    return createOpenAI({ apiKey: process.env["OPENEXPERT_API_KEY"] ?? "", baseURL })(id);
  }
  if (def?.adapter === "anthropic") {
    const apiKey = process.env[def.env ?? ""] || process.env["OPENEXPERT_MODEL_KEY"];
    if (!apiKey) throw new Error(`Falta configurar la clave de ${def.name}.`);
    if (!def.baseUrl) throw new Error(`El proveedor ${def.name} no tiene dirección configurada.`);
    return createAnthropic({ apiKey, baseURL: def.baseUrl })(id);
  }
  if (sel.provider === "opencode-go") {
    const apiKey = process.env["OPENEXPERT_MODEL_KEY"];
    if (!apiKey)
      throw new Error("Falta configurar la clave de OpenCode Go (el campo de clave BYOK).");
    return createOpenAI({
      apiKey,
      baseURL,
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        for (const [k, v] of Object.entries(opencodeGoHeaders(sessionId))) headers.set(k, v);
        return fetch(input, { ...init, headers });
      },
    })(id);
  }
  const apiKey = process.env["GOOGLE_API_KEY"];
  if (!apiKey) throw new Error("Falta configurar la clave de Gemini (GOOGLE_API_KEY).");
  return createGoogleGenerativeAI({ apiKey })(id);
}

export function modelLabel(): string {
  return `${selectedProvider()}:${selectedModelId()}`;
}
