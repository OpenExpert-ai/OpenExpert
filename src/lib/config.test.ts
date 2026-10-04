// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { aiUpdateSchema } from "./config.server";

const base = {
  provider: "ollama" as const,
  modelId: "llama3.1",
  ollamaBaseUrl: "http://localhost:11434",
  baseUrl: "",
  temperature: 0.2,
  topP: 1,
  maxOutputTokens: 4096,
};

describe("aiUpdateSchema", () => {
  it("accepts a valid payload", () => {
    expect(aiUpdateSchema.parse(base).provider).toBe("ollama");
  });

  it("rejects an unknown provider", () => {
    expect(() => aiUpdateSchema.parse({ ...base, provider: "nope" })).toThrow();
  });

  it("rejects an empty model id", () => {
    expect(() => aiUpdateSchema.parse({ ...base, modelId: "  " })).toThrow();
  });

  it("rejects a malformed URL", () => {
    expect(() => aiUpdateSchema.parse({ ...base, ollamaBaseUrl: "not-a-url" })).toThrow();
  });

  it("allows an empty URL (uses the provider default)", () => {
    expect(aiUpdateSchema.parse({ ...base, ollamaBaseUrl: "" }).ollamaBaseUrl).toBe("");
  });
});
