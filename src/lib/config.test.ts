// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { aiUpdateSchema, applyFileConfigToEnv, chatUpdateSchema } from "./config.server";

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

describe("chatUpdateSchema", () => {
  const chat = {
    maxSteps: 50,
    injectionGuard: true,
    injectionExtraPatterns: [] as string[],
    retentionDays: 30,
  };

  it("accepts a valid payload", () => {
    expect(chatUpdateSchema.parse(chat).retentionDays).toBe(30);
  });

  it("rejects an invalid regex pattern", () => {
    expect(() => chatUpdateSchema.parse({ ...chat, injectionExtraPatterns: ["("] })).toThrow();
  });

  it("rejects an out-of-range maxSteps", () => {
    expect(() => chatUpdateSchema.parse({ ...chat, maxSteps: 0 })).toThrow();
  });
});

describe("applyFileConfigToEnv", () => {
  it("does not override an environment variable set at runtime", () => {
    // Regression: `restoreBackup()` re-applies openexpert.json, which used to
    // clobber a data dir set at runtime (the test suite wiped the real DB).
    const prev = process.env["OPENEXPERT_DATA_DIR"];
    process.env["OPENEXPERT_DATA_DIR"] = "/tmp/openexpert-runtime-wins";
    try {
      applyFileConfigToEnv();
      expect(process.env["OPENEXPERT_DATA_DIR"]).toBe("/tmp/openexpert-runtime-wins");
    } finally {
      if (prev === undefined) delete process.env["OPENEXPERT_DATA_DIR"];
      else process.env["OPENEXPERT_DATA_DIR"] = prev;
    }
  });
});
