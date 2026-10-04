// SPDX-License-Identifier: MIT
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
});
