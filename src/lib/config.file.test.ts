// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  MAX_INJECTION_PATTERNS,
  MAX_OUTPUT_TOKENS_LIMIT,
  MAX_STEPS_LIMIT,
  RETENTION_DAYS_LIMIT,
} from "./config.server";

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

  it("rejects a pattern that can freeze the server", async () => {
    // The second entry: `openexpert.json` goes through the same guard as the panel.
    const { parseRawConfig } = await import("./config.server");
    expect(() =>
      parseRawConfig(JSON.stringify({ chat: { injectionExtraPatterns: ["((a+))+$"] } })),
    ).toThrow();
    expect(() =>
      parseRawConfig(JSON.stringify({ chat: { injectionExtraPatterns: ["(a|aa)+"] } })),
    ).toThrow();
    expect(
      parseRawConfig(JSON.stringify({ chat: { injectionExtraPatterns: ["hola|adios"] } })).chat
        ?.injectionExtraPatterns,
    ).toEqual(["hola|adios"]);
  });

  it("rejects a pattern that is slow although its shape looks harmless", async () => {
    // The hole of T-0184: these have no repeated group, so the shape rule said
    // yes. The guard now measures the cost, and these three are the ones the
    // task measured: the first froze the app for 23.4 s on a sixty-character
    // message, the second never came back.
    const { parseRawConfig } = await import("./config.server");
    expect(() =>
      parseRawConfig(JSON.stringify({ chat: { injectionExtraPatterns: [".*.*.*.*.*.*b"] } })),
    ).toThrow();
    expect(() =>
      parseRawConfig(JSON.stringify({ chat: { injectionExtraPatterns: [".*.*.*.*.*.*.*.*.*b"] } })),
    ).toThrow();
    expect(() =>
      parseRawConfig(JSON.stringify({ chat: { injectionExtraPatterns: ["a*".repeat(14) + "b"] } })),
    ).toThrow();
  });

  it("rejects a slow pattern in the settings panel too", async () => {
    // The panel and the raw editor are two doors to the same file, so both
    // have to refuse the same pattern.
    const { chatUpdateSchema } = await import("./config.server");
    const base = {
      maxSteps: 50,
      injectionGuard: true,
      visionPdf: false,
      retentionDays: 30,
    };
    expect(() =>
      chatUpdateSchema.parse({ ...base, injectionExtraPatterns: [".*.*.*.*.*.*b"] }),
    ).toThrow();
    expect(() =>
      chatUpdateSchema.parse({ ...base, injectionExtraPatterns: ["ignora (tus )?instrucciones"] }),
    ).not.toThrow();
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

  it("no toca el fichero cuando un límite se pasa del tope del panel", async () => {
    const { writeRawConfig, resetFileConfig, rawConfigText } = await import("./config.server");
    writeRawConfig(JSON.stringify({ modelProvider: "google", chat: { maxSteps: 40 } }), cwd);
    const before = rawConfigText(cwd);
    // 100000 pasos son 100000 llamadas al proveedor en una sola consulta: el editor en
    // crudo tiene que rechazarlos antes de escribir, no dejarlos en el fichero.
    expect(() => writeRawConfig(JSON.stringify({ chat: { maxSteps: 100_000 } }), cwd)).toThrow(
      /maxSteps/,
    );
    expect(() => writeRawConfig(JSON.stringify({ chat: { retentionDays: 999_999 } }), cwd)).toThrow(
      /retentionDays/,
    );
    expect(() =>
      writeRawConfig(JSON.stringify({ ai: { maxOutputTokens: 100_000_000 } }), cwd),
    ).toThrow(/maxOutputTokens/);
    expect(rawConfigText(cwd)).toBe(before);
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

  it("carries the Notion client id", async () => {
    const { writeFileConfig, effectiveConfig, resetFileConfig } = await import("./config.server");
    writeFileConfig({ notionClientId: "notion-abc" }, cwd);
    expect(effectiveConfig(cwd).notionClientId).toBe("notion-abc");
    resetFileConfig(cwd);
  });
});

/**
 * The third door: the limits are enforced when the file is **written** (the
 * panel and the raw editor) and when a copy is **restored**, but the read —
 * the one that happens every time the application starts — took whatever the
 * file said.
 *
 * A file written by hand, or one from a version that did not have the limits,
 * therefore ran the application with 100000 steps per query (100000 billable
 * calls to the provider in one request) and with the purge of the history
 * switched off.
 */
describe("los límites al leer el fichero", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "oe-config-limites-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeFile(content: unknown): void {
    writeFileSync(join(dir, "openexpert.json"), JSON.stringify(content));
  }

  it("trae los números fuera de rango a su tope", async () => {
    const { effectiveConfig } = await import("./config.server");
    writeFile({
      chat: { maxSteps: 100_000, retentionDays: 999_999 },
      ai: { maxOutputTokens: 100_000_000 },
    });
    const cfg = effectiveConfig(dir);
    expect(cfg.chat.maxSteps).toBe(MAX_STEPS_LIMIT);
    expect(cfg.chat.retentionDays).toBe(RETENTION_DAYS_LIMIT);
    expect(cfg.ai.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS_LIMIT);
  });

  it("acota la lista de patrones al leer", async () => {
    // Every pattern is measured against an adversarial input before it is
    // used, so a list of five thousand costs tens of seconds of blocked
    // thread on the first chat.
    const { effectiveConfig } = await import("./config.server");
    writeFile({
      chat: { injectionExtraPatterns: Array.from({ length: 5000 }, (_, i) => `p${i}`) },
    });
    expect(effectiveConfig(dir).chat.injectionExtraPatterns).toHaveLength(MAX_INJECTION_PATTERNS);
  });

  it("dice qué recorta, en vez de callarse", async () => {
    // A limit broken in silence is a limit the owner does not know is broken.
    const { configNotices, describeConfigNotices } = await import("./config.server");
    writeFile({
      chat: { maxSteps: 100_000, retentionDays: 999_999 },
      ai: { maxOutputTokens: 100_000_000 },
    });
    const notices = configNotices(dir);
    expect(notices).toHaveLength(3);
    const sentences = describeConfigNotices(notices);
    expect(sentences.join(" ")).toMatch(/chat\.maxSteps/);
    expect(sentences.join(" ")).toMatch(/100000/);
    expect(sentences.join(" ")).toMatch(/200/);
    expect(sentences.join(" ")).toMatch(/chat\.retentionDays/);
    expect(sentences.join(" ")).toMatch(/ai\.maxOutputTokens/);
  });

  it("el diagnóstico lleva los avisos, que es donde el panel los enseña", async () => {
    // The notices travel as data, so the panel can write them in the language
    // of the interface. The Spanish sentences are the CLI's.
    const { diagnostics } = await import("./config.server");
    writeFile({ chat: { maxSteps: 100_000 } });
    const notices = diagnostics(dir).notices;
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "limit", field: "chat.maxSteps", limit: 200 });
  });

  it("no dice nada cuando el fichero está dentro de los límites", async () => {
    const { configNotices } = await import("./config.server");
    writeFile({ chat: { maxSteps: 40, retentionDays: 7 } });
    expect(configNotices(dir)).toEqual([]);
  });
});
