// SPDX-License-Identifier: MIT
// Server-side model provider selection, built on @openexpert/opencore.
// Providers: google (Gemini free key), ollama (local), openai-compatible (BYOK).

import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  missingKeyHint,
  ollamaChatBaseUrl,
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
 * Headers sent with every request to a self-hosted or BYOK endpoint.
 *
 * Two reasons, both practical. Gateways that route by client want the app to
 * identify itself instead of arriving as a bare SDK, and some refuse a request
 * that carries no session id — one such gateway answers 400 without it. Both
 * headers are additive: an endpoint that does not ask for them ignores them, and
 * nothing is sent when there is no session to name.
 */
export function gatewayHeaders(sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "user-agent": `OpenExpert/${process.env["npm_package_version"] || "dev"}`,
  };
  if (sessionId) headers[SESSION_HEADER] = sessionId;
  return headers;
}

export function getLanguageModel(sessionId?: string): LanguageModel {
  const sel = selectModel();
  const id = sel.modelId;
  if (sel.provider === "ollama") {
    const baseURL = ollamaChatBaseUrl(process.env["OLLAMA_BASE_URL"] || "http://localhost:11434");
    return createOpenAI({ apiKey: "ollama", baseURL })(id);
  }
  if (sel.provider === "openai-compatible") {
    const baseURL = process.env["OPENEXPERT_BASE_URL"];
    if (!baseURL) throw new Error("Falta OPENEXPERT_BASE_URL");
    return createOpenAI({
      apiKey: process.env["OPENEXPERT_API_KEY"] ?? "",
      baseURL,
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        for (const [k, v] of Object.entries(gatewayHeaders(sessionId))) headers.set(k, v);
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
