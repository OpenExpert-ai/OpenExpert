// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDERS, PROVIDER_IDS } from "@openexpert/openexpert/model-provider";
import {
  aiUpdateSchema,
  applyFileConfigToEnv,
  chatUpdateSchema,
  checkFileConfig,
  describeConfigProblems,
  fileConfigSchema,
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

  it("rejects a pattern that can freeze the server, whatever its shape", () => {
    // `((a+))+` and `(a|aa)+` passed the old guard and cost the same four minutes as `(a+)+`.
    for (const pattern of ["((a+))+$", "(?:(?:a+))+$", "(a|aa)+", "(a|b+)+", "(a{1,3})+"]) {
      expect(() =>
        chatUpdateSchema.parse({ ...chat, injectionExtraPatterns: [pattern] }),
      ).toThrow();
    }
  });

  it("keeps accepting an alternation that is not repeated", () => {
    const parsed = chatUpdateSchema.parse({ ...chat, injectionExtraPatterns: ["hola|adios"] });
    expect(parsed.injectionExtraPatterns).toEqual(["hola|adios"]);
  });

  it("rejects an out-of-range maxSteps", () => {
    expect(() => chatUpdateSchema.parse({ ...chat, maxSteps: 0 })).toThrow();
  });
});

describe("fileConfigSchema", () => {
  // Ajustes → Avanzado escribe `openexpert.json` por este esquema y por el mismo camino que
  // el panel: `chat.maxSteps` acaba en `stepCountIs`, y cada paso es una llamada al proveedor.
  // Sin tope, pegar el JSON a mano se salta los límites que la interfaz sí aplica.
  it("corta los límites facturables donde los corta el panel", () => {
    expect(() => fileConfigSchema.parse({ chat: { maxSteps: 201 } })).toThrow(/1 a 200/);
    expect(() => fileConfigSchema.parse({ chat: { retentionDays: 3651 } })).toThrow(/0 a 3650/);
    expect(() => fileConfigSchema.parse({ ai: { maxOutputTokens: 200_001 } })).toThrow(
      /1 a 200000/,
    );
  });

  it("sigue aceptando el valor del tope y los de debajo", () => {
    const parsed = fileConfigSchema.parse({
      chat: { maxSteps: 200, retentionDays: 3650 },
      ai: { maxOutputTokens: 200_000 },
    });
    expect(parsed.chat?.maxSteps).toBe(200);
    expect(parsed.chat?.retentionDays).toBe(3650);
    expect(parsed.ai?.maxOutputTokens).toBe(200_000);
  });

  it("corta la lista de patrones donde la corta el panel", () => {
    // El panel acepta fifty como mucho; el fichero llevaba la lista sin tope, y
    // cada patrón se mide contra una entrada adversaria: una lista enorme
    // costaba segundos solo en validarla.
    const fifty = Array.from({ length: 50 }, (_, i) => `palabra${i}`);
    expect(fileConfigSchema.safeParse({ chat: { injectionExtraPatterns: fifty } }).success).toBe(
      true,
    );
    const many = Array.from({ length: 51 }, (_, i) => `palabra${i}`);
    expect(() => fileConfigSchema.parse({ chat: { injectionExtraPatterns: many } })).toThrow(/50/);
  });

  it("el proveedor inválido se dice en español y con los que existen", () => {
    // Zod's own message for an enum is an English «Invalid option», and the
    // owner of the installation reads the panel, not the source of Zod.
    const r = fileConfigSchema.safeParse({ modelProvider: "openai" });
    expect(r.success).toBe(false);
    if (r.success) return;
    const message = r.error.issues[0]?.message ?? "";
    expect(message).toMatch(/modelProvider/);
    expect(message).toMatch(/openai-compatible/);
    expect(message).not.toMatch(/Invalid option/);
  });
});

describe("checkFileConfig", () => {
  // The door the restore opens with: it says what is wrong with a
  // configuration in the words of the person who has to fix it.
  it("acepta una configuración válida", () => {
    const r = checkFileConfig({ modelProvider: "ollama", chat: { maxSteps: 40 } });
    expect(r.ok).toBe(true);
  });

  it("nombra el campo y el límite que se rompe", () => {
    const r = checkFileConfig({ chat: { maxSteps: 100_000, retentionDays: 999_999 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems).toHaveLength(2);
    expect(r.problems.join(" ")).toMatch(/chat\.maxSteps/);
    expect(r.problems.join(" ")).toMatch(/1 a 200/);
    expect(r.problems.join(" ")).toMatch(/chat\.retentionDays/);
    expect(r.problems.join(" ")).toMatch(/0 a 3650/);
  });

  it("no repite el nombre del campo cuando el mensaje ya lo dice", () => {
    // «chat.maxSteps: maxSteps va de 1 a 200» dice lo mismo dos veces.
    const r = checkFileConfig({ chat: { maxSteps: 100_000 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0]).toBe("chat.maxSteps: va de 1 a 200 pasos por consulta");
  });

  it("cuenta los patrones antes de medirlos", () => {
    // Medir un patrón es caro; una lista que nadie escribió no se mide.
    const many = Array.from({ length: 200 }, (_, i) => `palabra${i}`);
    const t0 = Date.now();
    const r = checkFileConfig({ chat: { injectionExtraPatterns: many } });
    const ms = Date.now() - t0;
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0]).toMatch(/injectionExtraPatterns/);
    expect(r.problems[0]).toMatch(/50/);
    expect(ms).toBeLessThan(500);
  });

  it("describeConfigProblems devuelve una línea por problema", () => {
    const r = fileConfigSchema.safeParse({ chat: { maxSteps: 100_000 } });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(describeConfigProblems(r.error)).toHaveLength(1);
  });

  it("el mensaje del tope de patrones sobrevive a que Zod reescriba el esquema", () => {
    // Zod v4 **rewrites** the object it is given as the error parameter: it
    // replaces `message` with `error`. A constant shared between the schema and
    // the code that reads it therefore loses its message the moment the schema
    // is built, and the check that counts the patterns before measuring them
    // would say «undefined». The message is a plain string for that reason.
    const r = checkFileConfig({
      chat: { injectionExtraPatterns: Array.from({ length: 60 }, (_, i) => `p${i}`) },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0]).toBe(
      "chat.injectionExtraPatterns: no puede haber más de 50 patrones de inyección",
    );
    // And the schema says the same thing.
    const s = fileConfigSchema.safeParse({
      chat: { injectionExtraPatterns: Array.from({ length: 60 }, (_, i) => `p${i}`) },
    });
    expect(s.success).toBe(false);
    if (s.success) return;
    expect(s.error.issues[0]?.message).toBe("no puede haber más de 50 patrones de inyección");
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
