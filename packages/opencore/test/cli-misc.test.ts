// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, loadConfig } from "../src/config.js";
import { missingKeyHint, selectModel } from "../src/model-provider.js";
import { credentialsPath } from "../src/secrets.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "oe-misc-"));
  vi.stubEnv("HOME", home);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

describe("loadConfig edge cases", () => {
  it("keeps an absolute dataDir untouched (no ~ expansion)", () => {
    vi.stubEnv("OPENEXPERT_DATA_DIR", "/var/lib/openexpert");
    expect(loadConfig("/nonexistent").dataDir).toBe("/var/lib/openexpert");
  });

  it("falls back to defaults when openexpert.json is corrupt", () => {
    const dir = mkdtempSync(join(tmpdir(), "oe-corrupt-"));
    try {
      writeFileSync(join(dir, "openexpert.json"), "{ broken");
      const cfg = loadConfig(dir);
      expect(cfg.modelProvider).toBe(DEFAULTS.modelProvider);
      expect(cfg.modelId).toBe(DEFAULTS.modelId);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("missingKeyHint with keys present", () => {
  it("returns null for google when GOOGLE_API_KEY is set", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "google" });
    expect(missingKeyHint(sel, { GOOGLE_API_KEY: "k" })).toBeNull();
  });

  it("returns null for openai-compatible when the model key is set", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "openai-compatible" });
    expect(missingKeyHint(sel, { OPENEXPERT_MODEL_KEY: "k" })).toBeNull();
  });
});

describe("credentialsPath without HOME", () => {
  it("keeps the ~ literal when HOME is unset", () => {
    vi.stubEnv("HOME", "");
    expect(credentialsPath("~/.openexpert")).toBe("~/.openexpert/credentials.json");
  });
});
