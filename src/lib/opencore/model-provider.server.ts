// SPDX-License-Identifier: MIT
// Server-side model provider selection, built on @openexpert/opencore.
// Providers: google (Gemini free key), ollama (local), openai-compatible (BYOK).

import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  missingKeyHint,
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

export function getLanguageModel(): LanguageModel {
  const sel = selectModel();
  const id = sel.modelId;
  if (sel.provider === "ollama") {
    const baseURL = process.env["OLLAMA_BASE_URL"] || "http://localhost:11434/v1";
    return createOpenAI({ apiKey: "ollama", baseURL })(id);
  }
  if (sel.provider === "openai-compatible") {
    const baseURL = process.env["OPENEXPERT_BASE_URL"];
    if (!baseURL) throw new Error("Falta OPENEXPERT_BASE_URL");
    return createOpenAI({ apiKey: process.env["OPENEXPERT_MODEL_KEY"] ?? "", baseURL })(id);
  }
  const apiKey = process.env["GOOGLE_API_KEY"];
  if (!apiKey) throw new Error("Falta configurar la clave de Gemini (GOOGLE_API_KEY).");
  return createGoogleGenerativeAI({ apiKey })(id);
}

export function modelLabel(): string {
  return `${selectedProvider()}:${selectedModelId()}`;
}
