// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  MAX_INJECTION_PATTERNS,
  MAX_OUTPUT_TOKENS_LIMIT,
  MAX_STEPS_LIMIT,
  RETENTION_DAYS_LIMIT,
  loadConfig,
  loadConfigWithNotices,
} from "../src/config.js";

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

/**
 * The limits are applied on the way in, because that is the door every
 * configuration comes through: a file written by hand, a file from a version
 * that did not have the limits, or a file that arrived from somewhere else.
 *
 * The panel and the raw editor refuse to **write** a value above them (the
 * app's `fileConfigSchema`), and the restore refuses a copy that carries one.
 * What was missing was the read: the file on disk wins, and the topes only
 * existed when the value passed through the interface.
 */
describe("los límites al leer el fichero", () => {
  function withFile(content: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), "oe-config-limites-"));
    writeFileSync(join(dir, "openexpert.json"), JSON.stringify(content));
    return dir;
  }

  it("trae los tres números fuera de rango a su tope", () => {
    // The values the task measured: 100000 steps are 100000 billable calls to
    // the provider in a single request, 999999 days switch the purge off and
    // 100 million output tokens in one turn.
    const dir = withFile({
      chat: { maxSteps: 100_000, retentionDays: 999_999 },
      ai: { maxOutputTokens: 100_000_000 },
    });
    try {
      const cfg = loadConfig(dir);
      expect(cfg.chat.maxSteps).toBe(MAX_STEPS_LIMIT);
      expect(cfg.chat.retentionDays).toBe(RETENTION_DAYS_LIMIT);
      expect(cfg.ai.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS_LIMIT);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("deja intacto un valor que está dentro del rango", () => {
    const dir = withFile({
      chat: { maxSteps: 40, retentionDays: 7 },
      ai: { maxOutputTokens: 1024 },
    });
    try {
      const cfg = loadConfig(dir);
      expect(cfg.chat.maxSteps).toBe(40);
      expect(cfg.chat.retentionDays).toBe(7);
      expect(cfg.ai.maxOutputTokens).toBe(1024);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("acepta el valor del tope", () => {
    const dir = withFile({
      chat: { maxSteps: MAX_STEPS_LIMIT, retentionDays: RETENTION_DAYS_LIMIT },
      ai: { maxOutputTokens: MAX_OUTPUT_TOKENS_LIMIT },
    });
    try {
      const cfg = loadConfig(dir);
      expect(cfg.chat.maxSteps).toBe(MAX_STEPS_LIMIT);
      expect(cfg.chat.retentionDays).toBe(RETENTION_DAYS_LIMIT);
      expect(cfg.ai.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS_LIMIT);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("trae un número por debajo del mínimo al mínimo", () => {
    // `maxSteps: 0` would stop the turn before the first step, and a negative
    // `maxOutputTokens` is not a number of tokens at all.
    const dir = withFile({
      chat: { maxSteps: 0, retentionDays: -5 },
      ai: { maxOutputTokens: 0 },
    });
    try {
      const cfg = loadConfig(dir);
      expect(cfg.chat.maxSteps).toBe(1);
      expect(cfg.chat.retentionDays).toBe(0);
      expect(cfg.ai.maxOutputTokens).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("acota la lista de patrones al leer", () => {
    // The grave case: every pattern is measured against an adversarial input
    // before it is used, so a list of five thousand costs tens of seconds of
    // blocked thread on the first chat.
    const dir = withFile({
      chat: { injectionExtraPatterns: Array.from({ length: 5000 }, (_, i) => `palabra${i}`) },
    });
    try {
      const cfg = loadConfig(dir);
      expect(cfg.chat.injectionExtraPatterns).toHaveLength(MAX_INJECTION_PATTERNS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("avisa de lo que recorta, en vez de callarse", () => {
    // A limit broken in silence is a limit the owner does not know is broken:
    // the file says one thing and the process does another.
    const dir = withFile({
      chat: { maxSteps: 100_000, retentionDays: 999_999 },
      ai: { maxOutputTokens: 100_000_000 },
    });
    try {
      const { notices } = loadConfigWithNotices(dir);
      const limits = notices.filter((n) => n.kind === "limit");
      expect(limits).toHaveLength(3);
      expect(limits.map((n) => (n.kind === "limit" ? n.field : ""))).toEqual([
        "chat.maxSteps",
        "chat.retentionDays",
        "ai.maxOutputTokens",
      ]);
      const steps = limits.find((n) => n.kind === "limit" && n.field === "chat.maxSteps");
      expect(steps).toMatchObject({ value: 100_000, limit: MAX_STEPS_LIMIT });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("avisa de cuántos patrones se descartan", () => {
    const dir = withFile({
      chat: { injectionExtraPatterns: Array.from({ length: 5000 }, (_, i) => `p${i}`) },
    });
    try {
      const { notices } = loadConfigWithNotices(dir);
      const patterns = notices.find((n) => n.kind === "patterns");
      expect(patterns).toMatchObject({ dropped: 4950, limit: MAX_INJECTION_PATTERNS });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no avisa de nada cuando el fichero está dentro de los límites", () => {
    const dir = withFile({
      chat: { maxSteps: 50, retentionDays: 30 },
      ai: { maxOutputTokens: 4096 },
    });
    try {
      expect(loadConfigWithNotices(dir).notices).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
