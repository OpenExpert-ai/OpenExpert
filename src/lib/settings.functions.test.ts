// SPDX-License-Identifier: MIT
// The settings panel is a set of server functions that write the two files the
// app boots from (`openexpert.json` and `secrets.json`) and mirror them into
// `process.env`. These tests drive that write path with the real zod validators
// and a temporary working directory, so the repository root is never touched.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_KEY_VARS, PROVIDERS } from "@openexpert/openexpert/model-provider";

type ServerFn = ((opts?: { data?: unknown }) => Promise<unknown>) & {
  validator: (validate: (input: unknown) => unknown) => ServerFn;
  handler: (run: (ctx: { data: unknown }) => unknown) => ServerFn;
};

vi.mock("@tanstack/react-start", () => {
  const createServerFn = (): ServerFn => {
    let validate: (input: unknown) => unknown = (input) => input;
    let run: ((ctx: { data: unknown }) => unknown) | undefined;
    const call = (async (opts?: { data?: unknown }) => {
      if (!run) throw new Error("server function without a handler");
      return await run({ data: validate(opts?.data) });
    }) as ServerFn;
    call.validator = (next) => {
      validate = next;
      return call;
    };
    call.handler = (next) => {
      run = next;
      return call;
    };
    return call;
  };
  return { createServerFn };
});

// Asking a provider for its models is a network call; the panel's job is to
// relay the answer, so the engine is mocked at its boundary.
const providerModels = vi.hoisted(() => ({
  listProviderModels: vi.fn(),
}));
vi.mock("@openexpert/openexpert/provider-models", () => ({
  listProviderModels: providerModels.listProviderModels,
}));

let dataDir: string;
let cwd: string;
let fns: typeof import("./settings.functions");
let db: typeof import("./db.server");
let schema: typeof import("../../drizzle/schema");
let cfg: typeof import("./config.server");

const ENV_KEYS = [
  "OPENEXPERT_MODEL_PROVIDER",
  "OPENEXPERT_MODEL_ID",
  "OLLAMA_BASE_URL",
  "OPENEXPERT_BASE_URL",
  "GOOGLE_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENEXPERT_MODEL_KEY",
  "OPENCODE_GO_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "openexpert-settings-data-"));
  cwd = mkdtempSync(join(tmpdir(), "openexpert-settings-cwd-"));
  process.env["OPENEXPERT_DATA_DIR"] = dataDir;
  // Every config.server write uses `process.cwd()` by default; the spy is what
  // keeps `openexpert.json` inside the temp directory.
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  db = await import("./db.server");
  schema = await import("../../drizzle/schema");
  cfg = await import("./config.server");
  fns = await import("./settings.functions");
});

afterAll(() => {
  vi.restoreAllMocks();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

beforeEach(async () => {
  providerModels.listProviderModels.mockReset();
  providerModels.listProviderModels.mockResolvedValue({ ok: true, models: ["m1", "m2"] });
  for (const key of ENV_KEYS) delete process.env[key];
  rmSync(join(cwd, "openexpert.json"), { force: true });
  rmSync(join(dataDir, "secrets.json"), { force: true });
  db.resetDbHandle();
  rmSync(db.dbPath(), { force: true });
  await db.getDb();
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

const aiPayload = (over: Record<string, unknown> = {}) => ({
  provider: "ollama",
  modelId: "llama3.1",
  endpoint: "http://localhost:11434",
  temperature: 0.2,
  topP: 0.9,
  maxOutputTokens: 4096,
  ...over,
});

const readJson = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
const secrets = () => readJson(join(dataDir, "secrets.json"));

describe("getSettings", () => {
  it("describe el catálogo entero, las rutas y el runtime", async () => {
    const settings = (await fns.getSettings()) as {
      ai: { provider: string };
      providers: { id: string }[];
      paths: { dataDir: string; config: string; secrets: string };
      runtime: { version: string; node: string; port: string };
    };
    expect(settings.providers.map((p) => p.id)).toEqual(PROVIDERS.map((p) => p.id));
    expect(settings.ai.provider).toBe("google");
    expect(settings.paths).toEqual({
      dataDir,
      config: join(cwd, "openexpert.json"),
      secrets: join(dataDir, "secrets.json"),
    });
    expect(settings.runtime.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(settings.runtime.node).toBe(process.version);
    expect(settings.runtime.port).toBe(process.env["PORT"] || "3000");
  });
});

describe("revealSecret", () => {
  it("devuelve el valor guardado, y el del entorno manda sobre el fichero", async () => {
    cfg.writeSecret("GOOGLE_CLIENT_SECRET", "del-fichero");
    expect(await fns.revealSecret({ data: { name: "GOOGLE_CLIENT_SECRET" } })).toEqual({
      value: "del-fichero",
    });

    process.env["GOOGLE_CLIENT_SECRET"] = "del-entorno";
    expect(await fns.revealSecret({ data: { name: "GOOGLE_CLIENT_SECRET" } })).toEqual({
      value: "del-entorno",
    });
  });

  it("si no hay valor devuelve null, no la cadena vacía", async () => {
    expect(await fns.revealSecret({ data: { name: "GOOGLE_CLIENT_ID" } })).toEqual({ value: null });
  });

  it("acepta todas las claves del catálogo y los identificadores de la lista blanca", async () => {
    for (const [index, name] of [
      ...PROVIDER_KEY_VARS,
      "GOOGLE_CLIENT_ID",
      "OPENEXPERT_BASE_URL",
    ].entries()) {
      cfg.writeSecret(name, `valor-${index}`);
      expect(await fns.revealSecret({ data: { name } })).toEqual({ value: `valor-${index}` });
    }
  });

  it("rechaza cualquier nombre fuera de la lista blanca", async () => {
    // La lista blanca es lo único que impide que esto sea un lector de entorno
    // arbitrario desde el navegador.
    for (const name of ["PATH", "HOME", "OPENEXPERT_DATA_DIR", "NOTION_CLIENT_SECRET"]) {
      await expect(fns.revealSecret({ data: { name } })).rejects.toThrow("Secreto no válido");
    }
  });
});

describe("updateAiSettings", () => {
  it("escribe proveedor, modelo y parámetros en openexpert.json y los refleja en el entorno", async () => {
    await expect(fns.updateAiSettings({ data: aiPayload() })).resolves.toEqual({ ok: true });

    const file = readJson(join(cwd, "openexpert.json"));
    expect(file).toMatchObject({
      modelProvider: "ollama",
      modelId: "llama3.1",
      ollamaBaseUrl: "http://localhost:11434",
      ai: { temperature: 0.2, topP: 0.9, maxOutputTokens: 4096 },
    });
    expect(file["$schema"]).toBeTypeOf("string");
    expect(process.env["OPENEXPERT_MODEL_PROVIDER"]).toBe("ollama");
    expect(process.env["OPENEXPERT_MODEL_ID"]).toBe("llama3.1");
    expect(process.env["OLLAMA_BASE_URL"]).toBe("http://localhost:11434");

    const { orm } = await db.getDb();
    const activity = orm.select().from(schema.activity).all();
    expect(activity[0]?.summary).toBe("Modelo actualizado: ollama:llama3.1");
  });

  it("cada clave se guarda en la variable de su proveedor, sin pisar las demás", async () => {
    await fns.updateAiSettings({
      data: aiPayload({
        provider: "anthropic",
        modelId: "claude-sonnet-4-5",
        endpoint: "",
        providerKeys: { anthropic: "sk-ant", google: "AIza" },
      }),
    });

    expect(secrets()).toMatchObject({ ANTHROPIC_API_KEY: "sk-ant", GOOGLE_API_KEY: "AIza" });
    expect(process.env["ANTHROPIC_API_KEY"]).toBe("sk-ant");
    expect(process.env["GOOGLE_API_KEY"]).toBe("AIza");
    // Anthropic trae su endpoint fijo: no se escribe ninguna URL.
    expect(process.env["OPENEXPERT_BASE_URL"]).toBeUndefined();

    // Borrar una clave con "" la quita del fichero y del entorno.
    await fns.updateAiSettings({
      data: aiPayload({
        provider: "anthropic",
        modelId: "claude-sonnet-4-5",
        endpoint: "",
        providerKeys: { anthropic: "", google: "AIza" },
      }),
    });
    expect(secrets()).toMatchObject({ GOOGLE_API_KEY: "AIza" });
    expect(secrets()["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(process.env["ANTHROPIC_API_KEY"]).toBeUndefined();
  });

  it("el endpoint de un proveedor BYOK va a secrets.json, no a openexpert.json", async () => {
    await fns.updateAiSettings({
      data: aiPayload({
        provider: "openai-compatible",
        modelId: "mi-modelo",
        endpoint: "https://api.ejemplo.test/v1",
        providerKeys: { "openai-compatible": "sk-propia" },
      }),
    });
    expect(secrets()).toMatchObject({
      OPENEXPERT_BASE_URL: "https://api.ejemplo.test/v1",
      OPENEXPERT_MODEL_KEY: "sk-propia",
    });
    expect(readJson(join(cwd, "openexpert.json"))["ollamaBaseUrl"]).toBeUndefined();
    expect(process.env["OPENEXPERT_BASE_URL"]).toBe("https://api.ejemplo.test/v1");
  });

  it("una clave para un proveedor que no guarda ninguna se rechaza", async () => {
    await expect(
      fns.updateAiSettings({ data: aiPayload({ providerKeys: { ollama: "k" } }) }),
    ).rejects.toThrow();
    await expect(
      fns.updateAiSettings({ data: aiPayload({ provider: "inventado" }) }),
    ).rejects.toThrow();
    await expect(
      fns.updateAiSettings({ data: aiPayload({ endpoint: "no-es-url" }) }),
    ).rejects.toThrow();
  });

  // Bug observado, no arreglado (la tarea es solo tests): vaciar el endpoint de
  // Ollama escribe `ollamaBaseUrl: ""` en openexpert.json, y `loadConfig` trata
  // la cadena vacía como valor (`??`), así que `aiSettings().ollamaBaseUrl`
  // vuelve vacío en vez de caer al valor por defecto. El panel y el motor sí
  // cogen el defecto (`stored || default` / `env[key] || default`), pero
  // `getSettings().ai.ollamaBaseUrl` informa de "". Debería quedar como el
  // defecto: http://localhost:11434.
  it.fails("vaciar el endpoint de Ollama vuelve al valor por defecto", async () => {
    await fns.updateAiSettings({ data: aiPayload({ provider: "ollama", endpoint: "" }) });
    const settings = (await fns.getSettings()) as { ai: { ollamaBaseUrl: string } };
    expect(settings.ai.ollamaBaseUrl).toBe("http://localhost:11434");
  });
});

describe("listModels y testProvider", () => {
  it("piden los modelos del proveedor activo al motor", async () => {
    expect(await fns.testProvider()).toEqual({ ok: true, count: 2, error: null });
    expect(await fns.listModels()).toEqual({ ok: true, models: ["m1", "m2"] });
    expect(providerModels.listProviderModels).toHaveBeenCalledWith(cfg.aiSettings().provider);
  });

  it("propagan el error del proveedor sin inventarse modelos", async () => {
    providerModels.listProviderModels.mockResolvedValue({
      ok: false,
      models: [],
      error: "401 Unauthorized",
    });
    expect(await fns.testProvider()).toEqual({ ok: false, count: 0, error: "401 Unauthorized" });
    expect(await fns.listModels()).toEqual({ ok: false, models: [], error: "401 Unauthorized" });
  });
});

describe("configuración avanzada", () => {
  it("saveRawConfig valida y reaplica el entorno", async () => {
    const content = JSON.stringify({
      modelProvider: "google",
      modelId: "gemini-2.5-flash",
      chat: { retentionDays: 7 },
    });
    await expect(fns.saveRawConfig({ data: { content } })).resolves.toEqual({ ok: true });

    expect(readJson(join(cwd, "openexpert.json"))).toMatchObject({
      modelProvider: "google",
      modelId: "gemini-2.5-flash",
      chat: { retentionDays: 7 },
    });
    expect(process.env["OPENEXPERT_MODEL_PROVIDER"]).toBe("google");
  });

  it("saveRawConfig rechaza JSON inválido o fuera de esquema sin escribir nada", async () => {
    const before = existsSync(join(cwd, "openexpert.json"));
    await expect(fns.saveRawConfig({ data: { content: "{no es json" } })).rejects.toThrow();
    await expect(
      fns.saveRawConfig({ data: { content: JSON.stringify({ modelProvider: "nope" }) } }),
    ).rejects.toThrow();
    await expect(fns.saveRawConfig({ data: { content: "x".repeat(100_001) } })).rejects.toThrow();
    expect(existsSync(join(cwd, "openexpert.json"))).toBe(before);
  });

  it("resetConfig borra openexpert.json y devuelve ok", async () => {
    await fns.updateAiSettings({ data: aiPayload() });
    expect(existsSync(join(cwd, "openexpert.json"))).toBe(true);
    await expect(fns.resetConfig()).resolves.toEqual({ ok: true });
    expect(existsSync(join(cwd, "openexpert.json"))).toBe(false);
  });

  it("getAdvanced devuelve el texto en crudo, el informe de entorno y el diagnóstico", async () => {
    const advanced = (await fns.getAdvanced()) as {
      raw: string;
      env: { name: string; set: boolean; secret: boolean; value?: string }[];
      diagnostics: Record<string, unknown>;
    };
    expect(() => JSON.parse(advanced.raw) as unknown).not.toThrow();
    expect(advanced.env.length).toBeGreaterThan(0);
    // Las variables marcadas como secretas nunca se devuelven con valor.
    expect(
      advanced.env.filter((entry) => entry.secret).every((entry) => entry.value === undefined),
    ).toBe(true);
    expect(advanced.diagnostics).toMatchObject({
      provider: "google",
      dataDir,
      dataDirWritable: true,
      dbPath: db.dbPath(),
      configExists: false,
      secretsExists: false,
    });
  });
});

describe("datos", () => {
  it("getDataStats cuenta lo que hay sin exponer contenido", async () => {
    expect(await fns.getDataStats()).toMatchObject({
      experts: 4,
      integrations: 11,
      activity: 0,
      chatMessages: 0,
      backupsSupported: true,
    });
  });

  it("clearChatHistory borra todos los mensajes y dice cuántos había", async () => {
    const { orm } = await db.getDb();
    for (const id of ["m1", "m2"]) {
      orm
        .insert(schema.chatMessages)
        .values({
          id,
          expertId: "general",
          conversationId: "c1",
          message: { role: "user", parts: [] },
          createdAt: new Date().toISOString(),
        })
        .run();
    }
    await expect(fns.clearChatHistory()).resolves.toEqual({ removed: 2 });
    expect(orm.select().from(schema.chatMessages).all()).toEqual([]);
  });

  it("resetData vuelve al estado sembrado y lo deja registrado", async () => {
    const { orm } = await db.getDb();
    orm
      .insert(schema.experts)
      .values({
        id: "propio",
        name: "Propio",
        description: "",
        sources: [],
        domains: [],
        createdAt: new Date().toISOString(),
      })
      .run();
    await db.persist();

    await expect(fns.resetData()).resolves.toEqual({ ok: true });

    const { orm: after } = await db.getDb();
    expect(
      after
        .select()
        .from(schema.experts)
        .all()
        .map((e) => e.id),
    ).toEqual(expect.arrayContaining(["general", "ventas", "finanzas", "marketing"]));
    expect(
      after
        .select()
        .from(schema.experts)
        .all()
        .some((e) => e.id === "propio"),
    ).toBe(false);
    expect(
      after
        .select()
        .from(schema.activity)
        .all()
        .some((a) => a.summary === "Datos restaurados a estado inicial (re-sembrado)"),
    ).toBe(true);
  });

  it("importBackup aplica un paquete vacío y rechaza lo que no es un paquete", async () => {
    const bundle = JSON.stringify({ format: "openexpert-backup", version: 1, files: {} });
    await expect(fns.importBackup({ data: { content: bundle } })).resolves.toEqual({
      applied: [],
    });
    await expect(fns.importBackup({ data: { content: "{no es un backup" } })).rejects.toThrow();
    await expect(
      fns.importBackup({
        data: { content: JSON.stringify({ format: "otra-cosa", version: 1, files: {} }) },
      }),
    ).rejects.toThrow();
  });

  it("vacuumDb compacta sin perder filas", async () => {
    await expect(fns.vacuumDb()).resolves.toEqual({ ok: true });
    expect(await fns.getDataStats()).toMatchObject({ experts: 4 });
  });
});

describe("preferencias de interfaz", () => {
  it("getUiSettings devuelve los valores por defecto", async () => {
    expect(await fns.getUiSettings()).toEqual({
      theme: "dark",
      density: "comfortable",
      language: "es",
    });
  });

  it("setUiSettings mezcla el cambio con lo guardado y persiste", async () => {
    await expect(fns.setUiSettings({ data: { theme: "light" } })).resolves.toEqual({
      theme: "light",
      density: "comfortable",
      language: "es",
    });
    await expect(
      fns.setUiSettings({ data: { language: "en", density: "compact" } }),
    ).resolves.toEqual({ theme: "light", density: "compact", language: "en" });

    // Otra lectura del módulo (la que hace el cliente al recargar) ve lo mismo.
    const { orm } = await db.getDb();
    const row = orm.select().from(schema.settings).all()[0];
    expect(row).toMatchObject({
      key: "ui",
      value: { theme: "light", density: "compact", language: "en" },
    });
    expect(await fns.getUiSettings()).toEqual({
      theme: "light",
      density: "compact",
      language: "en",
    });
  });

  it("rechaza un tema que no existe", async () => {
    await expect(fns.setUiSettings({ data: { theme: "neon" } })).rejects.toThrow();
  });
});

describe("ajustes de chat", () => {
  it("getChatSettings devuelve la retención y el guardián", async () => {
    const chat = (await fns.getChatSettings()) as {
      retentionDays: number;
      injectionGuard: boolean;
    };
    expect(chat.retentionDays).toBeGreaterThan(0);
    expect(typeof chat.injectionGuard).toBe("boolean");
  });

  it("updateChatSettings escribe el fichero y lo registra en la actividad", async () => {
    const payload = {
      maxSteps: 40,
      injectionGuard: false,
      injectionExtraPatterns: ["ignora lo anterior"],
      retentionDays: 15,
    };
    await expect(fns.updateChatSettings({ data: payload })).resolves.toEqual({ ok: true });

    expect(readJson(join(cwd, "openexpert.json"))["chat"]).toMatchObject(payload);
    const { orm } = await db.getDb();
    expect(orm.select().from(schema.activity).all()[0]?.summary).toBe(
      "Ajustes de chat actualizados (guardia: desactivada, retención: 15 días)",
    );
  });

  it("rechaza un patrón regular inválido antes de escribir", async () => {
    await expect(
      fns.updateChatSettings({
        data: {
          maxSteps: 40,
          injectionGuard: true,
          injectionExtraPatterns: ["("],
          retentionDays: 15,
        },
      }),
    ).rejects.toThrow();
    expect(existsSync(join(cwd, "openexpert.json"))).toBe(false);
  });
});

describe("config.server y el fichero de secretos", () => {
  it("escribe los secretos con permisos 0600", async () => {
    cfg.writeSecret("GOOGLE_API_KEY", "AIza");
    const { statSync } = await import("node:fs");
    expect(statSync(join(dataDir, "secrets.json")).mode & 0o777).toBe(0o600);
  });

  it("writeSecret fusiona claves y borra solo la indicada con null", () => {
    cfg.writeSecret("GOOGLE_API_KEY", "uno");
    cfg.writeSecret("ANTHROPIC_API_KEY", "dos");
    expect(cfg.readSecrets()).toEqual({ GOOGLE_API_KEY: "uno", ANTHROPIC_API_KEY: "dos" });
    cfg.writeSecret("GOOGLE_API_KEY", null);
    expect(cfg.readSecrets()).toEqual({ ANTHROPIC_API_KEY: "dos" });
  });
});
