// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let cwd: string;

beforeAll(() => {
  cwd = mkdtempSync(join(tmpdir(), "openexpert-config-file-"));
});

afterAll(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("openexpert.json", () => {
  it("parses valid raw config and rejects invalid", async () => {
    const { parseRawConfig } = await import("./config.server");
    expect(parseRawConfig(JSON.stringify({ modelProvider: "ollama" })).modelProvider).toBe(
      "ollama",
    );
    expect(() => parseRawConfig(JSON.stringify({ modelProvider: "nope" }))).toThrow();
  });

  it("writes, reads, edits and resets the file", async () => {
    const { writeFileConfig, readFileConfigRaw, resetFileConfig, effectiveConfig } =
      await import("./config.server");
    writeFileConfig(
      { modelId: "llama3.1", ai: { temperature: 0.9, topP: 1, maxOutputTokens: 1024 } },
      cwd,
    );
    expect(readFileConfigRaw(cwd).modelId).toBe("llama3.1");
    expect(effectiveConfig(cwd).ai.temperature).toBe(0.9);

    resetFileConfig(cwd);
    expect(readFileConfigRaw(cwd).modelId).toBeUndefined();
  });

  it("validates raw text before writing and can reset", async () => {
    const { writeRawConfig, resetFileConfig, rawConfigText } = await import("./config.server");
    writeRawConfig(JSON.stringify({ modelProvider: "google" }), cwd);
    expect(JSON.parse(rawConfigText(cwd)).modelProvider).toBe("google");
    expect(() => writeRawConfig("{not json", cwd)).toThrow();
    resetFileConfig(cwd);
  });

  it("reports the provider source from the file", async () => {
    const { writeFileConfig, aiSettings, resetFileConfig } = await import("./config.server");
    writeFileConfig({ modelProvider: "openai-compatible", modelId: "x" }, cwd);
    const s = aiSettings(cwd);
    expect(s.provider).toBe("openai-compatible");
    expect(s.providerSource).toBe("file");
    expect(s.modelIdSource).toBe("file");
    resetFileConfig(cwd);
  });

  it("returns the chat config and an env report", async () => {
    const { chatSettings, envReport } = await import("./config.server");
    expect(chatSettings(cwd).maxSteps).toBeGreaterThan(0);
    expect(Array.isArray(envReport())).toBe(true);
  });

  it("reports diagnostics against the data dir", async () => {
    const prev = process.env["OPENEXPERT_DATA_DIR"];
    process.env["OPENEXPERT_DATA_DIR"] = cwd;
    try {
      const { diagnostics } = await import("./config.server");
      const d = diagnostics();
      expect(d.dataDir).toBe(cwd);
      expect(d.dataDirWritable).toBe(true);
      expect(typeof d.provider).toBe("string");
    } finally {
      if (prev === undefined) delete process.env["OPENEXPERT_DATA_DIR"];
      else process.env["OPENEXPERT_DATA_DIR"] = prev;
    }
  });

  it("rawConfigText falls back to effective values when there is no file", async () => {
    const { resetFileConfig, rawConfigText } = await import("./config.server");
    resetFileConfig(cwd);
    const parsed = JSON.parse(rawConfigText(cwd));
    expect(parsed.$schema).toBeTruthy();
    expect(parsed.modelProvider).toBeTruthy();
  });

  it("carries the distributor Notion client id", async () => {
    const { writeFileConfig, effectiveConfig, resetFileConfig } = await import("./config.server");
    writeFileConfig({ notionClientId: "notion-abc" }, cwd);
    expect(effectiveConfig(cwd).notionClientId).toBe("notion-abc");
    resetFileConfig(cwd);
  });
});
