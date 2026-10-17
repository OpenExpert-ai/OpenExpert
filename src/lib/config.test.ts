// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDERS, PROVIDER_IDS } from "@openexpert/opencore/model-provider";
import {
  aiUpdateSchema,
  applyFileConfigToEnv,
  chatUpdateSchema,
  providerViews,
} from "./config.server";

const base = {
  provider: "ollama" as const,
  modelId: "llama3.1",
  endpoint: "http://localhost:11434",
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

  it("accepts every provider the catalogue declares", () => {
    // La regresión que originó esto: el validador tenía su propia lista de tres
    // y elegir Anthropic en el panel no se podía guardar.
    for (const provider of PROVIDER_IDS) {
      expect(aiUpdateSchema.parse({ ...base, provider }).provider).toBe(provider);
    }
  });

  it("guarda la clave de cada proveedor, y solo en la suya", () => {
    const parsed = aiUpdateSchema.parse({
      ...base,
      provider: "anthropic",
      providerKeys: { anthropic: "sk-ant", google: "", "opencode-go": "" },
    });
    expect(parsed.providerKeys).toEqual({ anthropic: "sk-ant", google: "", "opencode-go": "" });
  });

  it("rechaza una clave que no tiene dónde guardarse", () => {
    // Un proveedor local no guarda clave, y un id inventado tampoco: escribirlas
    // en silencio dejaría al usuario creyendo que quedó configurado.
    expect(() => aiUpdateSchema.parse({ ...base, providerKeys: { ollama: "k" } })).toThrow();
    expect(() => aiUpdateSchema.parse({ ...base, providerKeys: { nope: "k" } })).toThrow();
  });

  it("rejects an empty model id", () => {
    expect(() => aiUpdateSchema.parse({ ...base, modelId: "  " })).toThrow();
  });

  it("rejects a malformed URL", () => {
    expect(() => aiUpdateSchema.parse({ ...base, endpoint: "not-a-url" })).toThrow();
  });

  it("allows an empty URL (uses the provider default)", () => {
    expect(aiUpdateSchema.parse({ ...base, endpoint: "" }).endpoint).toBe("");
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

describe("providerViews", () => {
  // Lo que el panel dibuja: una entrada por ficha, con el estado de **su** clave
  // y de **su** endpoint. Si esto sale mal, la interfaz miente sobre dónde está
  // guardada cada cosa y volvemos al problema de la ranura compartida.
  let dataDir: string;
  let cwd: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "oe-views-data-"));
    cwd = mkdtempSync(join(tmpdir(), "oe-views-cwd-"));
    vi.stubEnv("OPENEXPERT_DATA_DIR", dataDir);
    writeFileSync(
      join(dataDir, "secrets.json"),
      JSON.stringify({
        ANTHROPIC_API_KEY: "sk-ant",
        OPENEXPERT_MODEL_KEY: "sk-generica",
        OPENEXPERT_BASE_URL: "https://api.ejemplo.com/v1",
      }),
      { mode: 0o600 },
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    for (const k of ["ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "OLLAMA_BASE_URL"]) {
      delete process.env[k];
    }
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  it("da una entrada por cada ficha del catálogo, con su clave y su endpoint", () => {
    const views = providerViews(cwd);
    expect(views.map((v) => v.id)).toEqual(PROVIDERS.map((p) => p.id));

    const anthropic = views.find((v) => v.id === "anthropic")!;
    expect(anthropic.key).toEqual({
      name: "ANTHROPIC_API_KEY",
      set: true,
      source: "secrets",
    });
    expect(anthropic.endpoint).toMatchObject({
      fixed: "https://api.anthropic.com/v1",
      env: null,
      inUse: "https://api.anthropic.com/v1",
    });
    expect(anthropic.models).toContain("claude-sonnet-4-5");
    expect(anthropic.keyUrl).toMatch(/^https:\/\//);

    const generic = views.find((v) => v.id === "openai-compatible")!;
    expect(generic.key?.set).toBe(true);
    expect(generic.key?.name).toBe("OPENEXPERT_MODEL_KEY");
    expect(generic.endpoint).toMatchObject({
      fixed: null,
      env: "OPENEXPERT_BASE_URL",
      value: "https://api.ejemplo.com/v1",
    });

    // El local no tiene clave, y su endpoint es el que trae el registro.
    const ollama = views.find((v) => v.id === "ollama")!;
    expect(ollama.key).toBeNull();
    expect(ollama.endpoint).toMatchObject({
      env: "OLLAMA_BASE_URL",
      value: "http://localhost:11434",
      fallback: "http://localhost:11434",
      inUse: "http://localhost:11434",
    });

    expect(views.find((v) => v.id === "google")?.key?.set).toBe(false);
  });

  it("lo que está en el entorno lo dice, y manda sobre lo guardado", () => {
    // `envAtBoot` se fija al importar el módulo, así que una variable puesta
    // después (como en el entorno del panel) se lee como «variable de entorno»
    // solo si no estaba ya en el fichero de secretos.
    vi.stubEnv("GOOGLE_API_KEY", "AIza-del-entorno");
    vi.stubEnv("OLLAMA_BASE_URL", "http://192.168.1.9:11434");
    const views = providerViews(cwd);
    expect(views.find((v) => v.id === "google")?.key).toMatchObject({
      name: "GOOGLE_API_KEY",
      set: true,
      source: "env",
    });
    const ollama = views.find((v) => v.id === "ollama")!;
    expect(ollama.endpoint.inUse).toBe("http://192.168.1.9:11434");
    expect(ollama.endpoint.value).toBe("http://192.168.1.9:11434");
    // Y la clave de Anthropic sigue siendo la suya, del fichero.
    expect(views.find((v) => v.id === "anthropic")?.key).toMatchObject({
      name: "ANTHROPIC_API_KEY",
      source: "secrets",
    });
  });

  it("usa el valor del fichero para el endpoint local cuando no hay variable", () => {
    writeFileSync(
      join(cwd, "openexpert.json"),
      JSON.stringify({ ollamaBaseUrl: "http://otro:1234" }),
    );
    const ollama = providerViews(cwd).find((v) => v.id === "ollama")!;
    expect(ollama.endpoint.value).toBe("http://otro:1234");
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
