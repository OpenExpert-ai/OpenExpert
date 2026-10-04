// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULTS, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("returns defaults when no file and no env are present", () => {
    const cfg = loadConfig("/nonexistent");
    expect(cfg.modelProvider).toBe(DEFAULTS.modelProvider);
    expect(cfg.modelId).toBe(DEFAULTS.modelId);
    expect(cfg.ollamaBaseUrl).toBe(DEFAULTS.ollamaBaseUrl);
    // dataDir is expanded from `~/...` to the user's home directory.
    expect(cfg.dataDir.endsWith(".openexpert")).toBe(true);
    expect(cfg.dataDir.startsWith("~")).toBe(false);
  });

  it("expands a leading ~ in dataDir", () => {
    process.env["OPENEXPERT_DATA_DIR"] = "~/custom-data";
    const cfg = loadConfig("/nonexistent");
    expect(cfg.dataDir.endsWith("custom-data")).toBe(true);
    delete process.env["OPENEXPERT_DATA_DIR"];
  });

  it("env vars win over defaults", () => {
    process.env["OPENEXPERT_MODEL_PROVIDER"] = "ollama";
    process.env["OPENEXPERT_MODEL_ID"] = "qwen2.5";
    const cfg = loadConfig("/nonexistent");
    expect(cfg.modelProvider).toBe("ollama");
    expect(cfg.modelId).toBe("qwen2.5");
    delete process.env["OPENEXPERT_MODEL_PROVIDER"];
    delete process.env["OPENEXPERT_MODEL_ID"];
  });

  it("ignores invalid provider values from env", () => {
    process.env["OPENEXPERT_MODEL_PROVIDER"] = "garbage";
    const cfg = loadConfig("/nonexistent");
    expect(cfg.modelProvider).toBe(DEFAULTS.modelProvider);
    delete process.env["OPENEXPERT_MODEL_PROVIDER"];
  });

  it("exposes ai and chat defaults", () => {
    const cfg = loadConfig("/nonexistent");
    expect(cfg.ai.temperature).toBe(DEFAULTS.ai.temperature);
    expect(cfg.ai.topP).toBe(DEFAULTS.ai.topP);
    expect(cfg.chat.maxSteps).toBe(DEFAULTS.chat.maxSteps);
    expect(cfg.chat.injectionGuard).toBe(true);
    expect(cfg.chat.retentionDays).toBe(DEFAULTS.chat.retentionDays);
  });

  it("merges ai/chat from openexpert.json with defaults for the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "oe-config-"));
    try {
      writeFileSync(
        join(dir, "openexpert.json"),
        JSON.stringify({ ai: { temperature: 0.9 }, chat: { retentionDays: 7 } }),
      );
      const cfg = loadConfig(dir);
      expect(cfg.ai.temperature).toBe(0.9);
      expect(cfg.ai.topP).toBe(DEFAULTS.ai.topP);
      expect(cfg.chat.retentionDays).toBe(7);
      expect(cfg.chat.maxSteps).toBe(DEFAULTS.chat.maxSteps);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads injectionExtraPatterns and keeps only strings", () => {
    const dir = mkdtempSync(join(tmpdir(), "oe-config-"));
    try {
      writeFileSync(
        join(dir, "openexpert.json"),
        JSON.stringify({ chat: { injectionExtraPatterns: ["foo", 3, "bar"] } }),
      );
      const cfg = loadConfig(dir);
      expect(cfg.chat.injectionExtraPatterns).toEqual(["foo", "bar"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
