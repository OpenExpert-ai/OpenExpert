// SPDX-License-Identifier: MIT
// OpenCore — which model to use. The harness is stable; the model is configuration.
//
// Providers:
//   - google:            Gemini via GOOGLE_API_KEY (free API key).
//   - ollama:            Local model via Ollama's OpenAI-compatible endpoint.
//   - openai-compatible: Any OpenAI-compatible endpoint with your own key.

export type ModelProviderId = "google" | "ollama" | "openai-compatible";

export type ModelSelection = {
  provider: ModelProviderId;
  modelId: string;
  /** Where the key comes from, without exposing the value. */
  keySource: "GOOGLE_API_KEY" | "OPENEXPERT_MODEL_KEY" | "none (local)";
};

export function selectModel(env: NodeJS.ProcessEnv = process.env): ModelSelection {
  const raw = env["OPENEXPERT_MODEL_PROVIDER"];
  const provider: ModelProviderId =
    raw === "ollama" || raw === "openai-compatible" ? raw : "google";

  if (provider === "ollama") {
    return {
      provider,
      modelId: env["OPENEXPERT_MODEL_ID"] || "llama3.1",
      keySource: "none (local)",
    };
  }
  if (provider === "openai-compatible") {
    return {
      provider,
      modelId: env["OPENEXPERT_MODEL_ID"] || "gpt-4o-mini",
      keySource: "OPENEXPERT_MODEL_KEY",
    };
  }
  return {
    provider: "google",
    modelId: env["OPENEXPERT_MODEL_ID"] || "gemini-2.5-flash",
    keySource: "GOOGLE_API_KEY",
  };
}

export function missingKeyHint(
  sel: ModelSelection,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (sel.provider === "ollama") return null;
  if (sel.provider === "google" && !env["GOOGLE_API_KEY"]) {
    return "Falta GOOGLE_API_KEY (o usa OPENEXPERT_MODEL_PROVIDER=ollama para modelo local).";
  }
  if (sel.provider === "openai-compatible" && !env["OPENEXPERT_MODEL_KEY"]) {
    return "Falta OPENEXPERT_MODEL_KEY para tu endpoint OpenAI-compatible.";
  }
  return null;
}
