// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { missingKeyHint, selectModel } from "../src/model-provider.js";

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
});
