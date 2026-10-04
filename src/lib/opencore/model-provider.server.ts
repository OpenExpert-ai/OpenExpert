// SPDX-License-Identifier: MIT
// Server-side model provider selection.
//
// Selects the AI model from configuration, builds the actual SDK object,
// and exposes the `LanguageModel` used by the AI SDK. The selector lives
// in @openexpert/opencore so it can be unit-tested in isolation; this
// file only adapts the selector to the server-side AI SDK constructors
// and adds the `openexpert` gateway provider.

import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  selectModel as selectModelCore,
  type ModelProviderId,
  type ModelSelection,
} from "@openexpert/opencore/model-provider";
import { loadGatewayConfig } from "@openexpert/opencore/gateway";

export type { ModelProviderId, ModelSelection };

export function selectedProvider(): ModelProviderId {
  return selectModelCore().provider;
}

export function selectedModelId(): string {
  return selectModelCore().modelId;
}

export function modelKeyError(): string | null {
  const sel = selectModelCore();
  if (sel.provider === "ollama") return null;
  if (sel.provider === "google" && !process.env["GOOGLE_API_KEY"])
    return "Falta configurar la clave de Gemini";
  if (sel.provider === "openai-compatible" && !process.env["OPENEXPERT_MODEL_KEY"])
    return "Falta OPENEXPERT_MODEL_KEY para tu endpoint OpenAI-compatible";
  if (sel.provider === "openexpert") {
    if (!process.env["OPENEXPERT_GATEWAY_URL"]) return "Falta OPENEXPERT_GATEWAY_URL";
    if (!process.env["OPENEXPERT_API_KEY"]) return "Falta OPENEXPERT_API_KEY";
  }
  return null;
}

export function getLanguageModel(): LanguageModel {
  const sel = selectModelCore();
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
  if (sel.provider === "openexpert") {
    const cfg = loadGatewayConfig();
    if (!cfg) throw new Error("Configura OPENEXPERT_GATEWAY_URL y OPENEXPERT_API_KEY");
    return createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL })(id);
  }
  const apiKey = process.env["GOOGLE_API_KEY"];
  if (!apiKey) throw new Error("Falta configurar la clave de Gemini");
  return createGoogleGenerativeAI({ apiKey })(id);
}

export function modelLabel(): string {
  const sel = selectModelCore();
  return `${sel.provider}:${sel.modelId}`;
}
