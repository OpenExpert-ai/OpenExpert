// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  missingKeyHint,
  ollamaApiBaseUrl,
  ollamaChatBaseUrl,
  selectModel,
} from "../src/model-provider.js";

describe("selectModel", () => {
  it("defaults to google / gemini-2.5-flash", () => {
    const sel = selectModel({});
    expect(sel.provider).toBe("google");
    expect(sel.modelId).toBe("gemini-2.5-flash");
    expect(sel.keySource).toBe("GOOGLE_API_KEY");
  });

  it("falls back to llama3.1 for ollama", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "ollama" });
    expect(sel.provider).toBe("ollama");
    expect(sel.modelId).toBe("llama3.1");
    expect(sel.keySource).toBe("none (local)");
  });

  it("ignores unknown providers", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "wat" });
    expect(sel.provider).toBe("google");
  });
});

describe("ollama base url normalisation", () => {
  it("turns a native root into an OpenAI-compatible base", () => {
    expect(ollamaChatBaseUrl("http://localhost:11434")).toBe("http://localhost:11434/v1");
    expect(ollamaChatBaseUrl("http://localhost:11434/")).toBe("http://localhost:11434/v1");
  });

  it("accepts a base that already ends in /v1", () => {
    expect(ollamaChatBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
    expect(ollamaApiBaseUrl("http://ollama:11434/v1")).toBe("http://ollama:11434");
    expect(ollamaApiBaseUrl("http://ollama:11434/")).toBe("http://ollama:11434");
  });
});

describe("missingKeyHint", () => {
  it("flags a missing google key", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "google" });
    expect(missingKeyHint(sel, {})).toMatch(/GOOGLE_API_KEY/);
  });

  it("flags a missing openai-compatible key", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "openai-compatible" });
    expect(missingKeyHint(sel, {})).toMatch(/OPENEXPERT_MODEL_KEY/);
  });

  it("never flags ollama", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "ollama" });
    expect(missingKeyHint(sel, {})).toBeNull();
  });

  it("nombra la variable del proveedor elegido, sea el que sea", () => {
    // Antes solo google y openai-compatible tenían mensaje: Anthropic y OpenCode
    // Go se quedaban sin aviso y el chat fallaba más tarde y más lejos.
    expect(missingKeyHint(selectModel({ OPENEXPERT_MODEL_PROVIDER: "anthropic" }), {})).toMatch(
      /ANTHROPIC_API_KEY/,
    );
    expect(
      missingKeyHint(selectModel({ OPENEXPERT_MODEL_PROVIDER: "anthropic" }), {
        ANTHROPIC_API_KEY: "k",
      }),
    ).toBeNull();
    expect(missingKeyHint(selectModel({ OPENEXPERT_MODEL_PROVIDER: "opencode-go" }), {})).toMatch(
      /OPENCODE_GO_API_KEY/,
    );
  });

  it("un proveedor que no está en el catálogo no tiene pista que dar", () => {
    expect(
      missingKeyHint({ provider: "nope" as never, modelId: "x", keySource: "none" }, {}),
    ).toBeNull();
  });
});
