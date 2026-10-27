// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/cli/lib.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/cli/lib.js")>();
  return {
    ...actual,
    // Control the checkout detection and the server process explicitly so the
    // command tests never spawn npm/node or touch the network.
    findRepoRoot: vi.fn(actual.findRepoRoot),
    ensureStandaloneApp: vi.fn(actual.ensureStandaloneApp),
    run: vi.fn(async () => 0),
  };
});

import { ensureStandaloneApp, findRepoRoot, run } from "../src/cli/lib.js";
import {
  cmdDoctor,
  cmdFix,
  cmdModels,
  cmdServe,
  cmdUpdate,
  cmdVersion,
} from "../src/cli/commands.js";

const findRepoRootMock = vi.mocked(findRepoRoot);
const ensureAppMock = vi.mocked(ensureStandaloneApp);
const runMock = vi.mocked(run);

let home: string;
let cwd: string;
let logs: string[];
let errs: string[];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "oe-cmd-home-"));
  cwd = mkdtempSync(join(tmpdir(), "oe-cmd-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("OPENEXPERT_DATA_DIR", join(home, "data"));
  for (const k of [
    "OPENEXPERT_MODEL_PROVIDER",
    "OPENEXPERT_MODEL_KEY",
    "OPENEXPERT_BASE_URL",
    "OPENCODE_GO_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_CLIENT_ID",
    "OPENEXPERT_GOOGLE_CLIENT_ID",
    "OLLAMA_BASE_URL",
    "PORT",
    "OPENEXPERT_HOST",
    "HOST",
  ]) {
    vi.stubEnv(k, "");
  }
  findRepoRootMock.mockReset();
  ensureAppMock.mockReset();
  runMock.mockReset().mockResolvedValue(0);
  logs = [];
  errs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a) => void errs.push(a.join(" ")));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("cmdVersion", () => {
  it("prints the version and exits 0", async () => {
    expect(cmdVersion()).toBe(0);
    expect(logs.join("\n")).toMatch(/^OpenExpert \d+\.\d+\.\d+/);
  });
});

describe("cmdDoctor", () => {
  it("flags a missing GOOGLE_API_KEY for the google provider", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "google");
    expect(await cmdDoctor(cwd)).toBe(1);
    expect(logs.join("\n")).toContain("provider: google");
    expect(logs.join("\n")).toContain("data dir: " + join(home, "data"));
    expect(logs.join("\n")).toMatch(/Falta GOOGLE_API_KEY/);
    expect(logs.join("\n")).toContain("pendiente:");
  });

  it("is OK for google when a key is present", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "google");
    vi.stubEnv("GOOGLE_API_KEY", "k");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    expect(await cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("OK: listo para arrancar.");
    expect(logs.join("\n")).not.toContain("sin Google OAuth");
  });

  it("notes the Drive disconnect when no OAuth client id is configured", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "google");
    vi.stubEnv("GOOGLE_API_KEY", "k");
    expect(await cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("sin Google OAuth el chat funciona");
  });

  it("reads the provider from the directory it was given, not from the process cwd", async () => {
    // No env override: the answer can only come from cwd/openexpert.json.
    writeFileSync(join(cwd, "openexpert.json"), JSON.stringify({ modelProvider: "ollama" }));
    expect(await cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("provider: ollama");
    expect(logs.join("\n")).not.toContain("provider: google");
  });

  it("requires key and base url for openai-compatible", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "openai-compatible");
    expect(await cmdDoctor(cwd)).toBe(1);
    expect(logs.join("\n")).toMatch(/Falta OPENEXPERT_MODEL_KEY/);
    expect(logs.join("\n")).toMatch(/Falta OPENEXPERT_BASE_URL/);
  });

  it("is OK for a configured openai-compatible provider", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "openai-compatible");
    vi.stubEnv("OPENEXPERT_MODEL_KEY", "k");
    vi.stubEnv("OPENEXPERT_BASE_URL", "https://api.example.com/v1");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    expect(await cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("OK: listo para arrancar.");
  });

  it("avisa cuando el directorio de datos no se puede crear", async () => {
    // El doctor es lo que se mira cuando algo no arranca: si el directorio no se
    // puede escribir, eso es un problema, no un detalle.
    vi.stubEnv("OPENEXPERT_DATA_DIR", "/proc/version/imposible");
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "ollama");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    expect(await cmdDoctor(cwd)).toBe(1);
    expect(logs.join("\n")).toMatch(/No se puede escribir en/);
  });

  it("un proveedor con clave propia no se conforma con la clave de otro", async () => {
    // Compartir la variable era el fallo: la clave del endpoint genérico no
    // autentica contra Anthropic, y el doctor tiene que decirlo.
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "anthropic");
    vi.stubEnv("OPENEXPERT_MODEL_KEY", "sk-de-otro-proveedor");
    expect(await cmdDoctor(cwd)).toBe(1);
    expect(logs.join("\n")).toContain("provider: anthropic (Anthropic (Claude))");
    expect(logs.join("\n")).toMatch(/Falta ANTHROPIC_API_KEY/);
  });

  it("está listo con la clave de Anthropic puesta", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    expect(await cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("OK: listo para arrancar.");
  });

  it("lee el proveedor de la carpeta que se le da, aunque sea nuevo", async () => {
    writeFileSync(join(cwd, "openexpert.json"), JSON.stringify({ modelProvider: "anthropic" }));
    expect(await cmdDoctor(cwd)).toBe(1);
    expect(logs.join("\n")).toMatch(/Falta ANTHROPIC_API_KEY/);
  });

  it("reports the ollama endpoint and never blocks", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "ollama");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    expect(await cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("endpoint: http://localhost:11434");
  });

  it("avisa de los límites que el fichero rompe, y no los deja pasar en silencio", async () => {
    // The CLI reads the file through the same reader the application uses, so
    // a value above the limit is brought back to it in both. The owner has to
    // be told: the file says one thing and the application does another.
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "ollama");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    writeFileSync(
      join(cwd, "openexpert.json"),
      JSON.stringify({
        chat: { maxSteps: 100_000, retentionDays: 999_999 },
        ai: { maxOutputTokens: 100_000_000 },
      }),
    );
    expect(await cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).toMatch(/chat\.maxSteps: 100000 se recorta a 200/);
    expect(logs.join("\n")).toMatch(/chat\.retentionDays: 999999 se recorta a 3650/);
    expect(logs.join("\n")).toMatch(/ai\.maxOutputTokens: 100000000 se recorta a 200000/);
  });

  it("avisa de los patrones de inyección que se descartan", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "ollama");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    writeFileSync(
      join(cwd, "openexpert.json"),
      JSON.stringify({
        chat: { injectionExtraPatterns: Array.from({ length: 200 }, (_, i) => `p${i}`) },
      }),
    );
    expect(await cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).toMatch(/150 patrón\(es\) de inyección descartados/);
  });

  it("no avisa de nada cuando el fichero está dentro de los límites", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "ollama");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    writeFileSync(
      join(cwd, "openexpert.json"),
      JSON.stringify({ chat: { maxSteps: 40, retentionDays: 7 } }),
    );
    expect(await cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).not.toContain("aviso:");
  });
});

describe("cmdFix", () => {
  it("writes an ollama config when none exists and detects no local model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "ollama");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    expect(await cmdFix(cwd)).toBe(0);
    const written = JSON.parse(readFileSync(join(cwd, "openexpert.json"), "utf8"));
    expect(written).toMatchObject({
      modelProvider: "ollama",
      modelId: "llama3.1",
      ollamaBaseUrl: "http://localhost:11434",
      dataDir: "~/.openexpert",
    });
    expect(logs.join("\n")).toContain("openexpert.json creado (Ollama).");
  });

  it("picks the first detected ollama model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ models: [{ name: "qwen2.5" }] }), { status: 200 }),
      ),
    );
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "ollama");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    await cmdFix(cwd);
    expect(JSON.parse(readFileSync(join(cwd, "openexpert.json"), "utf8")).modelId).toBe("qwen2.5");
  });

  it("keeps an existing config and re-normalises secrets permissions", async () => {
    writeFileSync(join(cwd, "openexpert.json"), JSON.stringify({ modelProvider: "google" }));
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(join(home, "data", "secrets.json"), JSON.stringify({ GOOGLE_API_KEY: "k" }));
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    expect(await cmdFix(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("openexpert.json ya existe.");
    expect(logs.join("\n")).toContain("permisos de");
    // The doctor run at the end must not touch the network.
  });
});

describe("cmdModels", () => {
  it("lists ollama models, marking the configured one", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "ollama");
    writeFileSync(join(cwd, "openexpert.json"), JSON.stringify({ modelId: "qwen2.5" }));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ models: [{ name: "llama3.1" }, { name: "qwen2.5" }] }), {
            status: 200,
          }),
      ),
    );
    expect(await cmdModels(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("Modelos en Ollama (local):");
    expect(logs.join("\n")).toMatch(/\* qwen2\.5/);
    expect(logs.join("\n")).toMatch(/llama3\.1/);
  });

  it("tells the user how to install Ollama when it is down", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "ollama");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    expect(await cmdModels(cwd)).toBe(1);
    expect(logs.join("\n")).toContain("No se pudo contactar con Ollama");
    expect(logs.join("\n")).toContain("ollama.com/install.sh");
  });

  it("lists models from an openai-compatible endpoint with the bearer key", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "openai-compatible");
    vi.stubEnv("OPENEXPERT_BASE_URL", "https://api.example.com/v1/");
    vi.stubEnv("OPENEXPERT_MODEL_KEY", "secret");
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await cmdModels(cwd)).toBe(0);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.example.com/v1/models");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toEqual({
      Authorization: "Bearer secret",
    });
    expect(logs.join("\n")).toContain("gpt-4o-mini");
  });

  it("asks for configuration when the openai-compatible endpoint is incomplete", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "openai-compatible");
    expect(await cmdModels(cwd)).toBe(1);
    expect(logs.join("\n")).toMatch(/Falta OPENEXPERT_MODEL_KEY/);
  });

  it("returns 1 when the endpoint does not answer", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "openai-compatible");
    vi.stubEnv("OPENEXPERT_BASE_URL", "https://api.example.com/v1");
    vi.stubEnv("OPENEXPERT_MODEL_KEY", "secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down"))),
    );
    expect(await cmdModels(cwd)).toBe(1);
    expect(logs.join("\n")).toContain("No se pudo preguntar a Compatible con OpenAI");
  });

  it("le pide a Google su clave en vez de inventarse una lista", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "google");
    expect(await cmdModels(cwd)).toBe(1);
    expect(logs.join("\n")).toMatch(/Falta GOOGLE_API_KEY/);
  });

  it("pregunta a Anthropic con su propia clave y su cabecera de versión", async () => {
    // El proveedor que motivó todo esto: sin rama propia en el CLI, la lista de
    // modelos tiene que salir de su endpoint y con su forma de autenticar.
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant");
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ data: [{ id: "claude-sonnet-4-5" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await cmdModels(cwd)).toBe(0);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.anthropic.com/v1/models?limit=100");
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(logs.join("\n")).toContain("claude-sonnet-4-5");
  });
});

describe("cmdServe", () => {
  it("runs npm run dev when a source checkout is found", async () => {
    findRepoRootMock.mockReturnValue(cwd);
    runMock.mockResolvedValue(7);
    expect(await cmdServe(cwd)).toBe(7);
    expect(logs.join("\n")).toContain("desde el código fuente");
    expect(runMock).toHaveBeenCalledWith("npm", ["run", "dev"], {
      cwd,
      env: expect.objectContaining({}),
    });
  });

  it("runs the downloaded standalone server when no checkout is found", async () => {
    findRepoRootMock.mockReturnValue(null);
    const app = join(home, "app");
    mkdirSync(join(app, ".output", "server"), { recursive: true });
    writeFileSync(join(app, ".output", "server", "index.mjs"), "// built");
    ensureAppMock.mockResolvedValue(app);
    runMock.mockResolvedValue(0);
    expect(await cmdServe(cwd)).toBe(0);
    expect(runMock).toHaveBeenCalledWith(
      process.execPath,
      [join(app, ".output", "server", "index.mjs")],
      expect.objectContaining({ cwd: app }),
    );
    const env = runMock.mock.calls[0]![2]!.env as Record<string, string>;
    expect(env.HOST).toBe("127.0.0.1");
    expect(env.PORT).toBe("3000");
    expect(logs.join("\n")).toContain("Arrancando OpenExpert en http://127.0.0.1:3000");
  });

  it("honours a custom PORT and flags it", async () => {
    findRepoRootMock.mockReturnValue(null);
    const app = join(home, "app");
    mkdirSync(join(app, ".output", "server"), { recursive: true });
    writeFileSync(join(app, ".output", "server", "index.mjs"), "// built");
    ensureAppMock.mockResolvedValue(app);
    vi.stubEnv("PORT", "4000");
    await cmdServe(cwd);
    expect(logs.join("\n")).toContain("host o puerto personalizados");
    const env = runMock.mock.calls[0]![2]!.env as Record<string, string>;
    expect(env.PORT).toBe("4000");
  });

  it("explains the alternatives when no server can be obtained", async () => {
    findRepoRootMock.mockReturnValue(null);
    ensureAppMock.mockResolvedValue(null);
    expect(await cmdServe(cwd)).toBe(1);
    expect(errs.join("\n")).toContain("No hay un servidor preconstruido disponible");
    expect(errs.join("\n")).toContain("docker run -p 3000:3000");
    expect(runMock).not.toHaveBeenCalled();
  });
});

describe("cmdUpdate", () => {
  it("removes the cached standalone server for the current version", async () => {
    // packageVersion() is "0.0.0" from the source tree; build that cache dir.
    const dir = join(home, ".openexpert", "app", "0.0.0");
    mkdirSync(dir, { recursive: true });
    expect(cmdUpdate()).toBe(0);
    expect(existsSync(dir)).toBe(false);
    expect(logs.join("\n")).toContain("caché del servidor eliminada");
  });

  it("says there is nothing to update when no cache exists", async () => {
    expect(cmdUpdate()).toBe(0);
    expect(logs.join("\n")).toContain("No hay servidor descargado que actualizar.");
  });
});
