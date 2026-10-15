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
  it("prints the version and exits 0", () => {
    expect(cmdVersion()).toBe(0);
    expect(logs.join("\n")).toMatch(/^OpenExpert \d+\.\d+\.\d+/);
  });
});

describe("cmdDoctor", () => {
  it("flags a missing GOOGLE_API_KEY for the google provider", () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "google");
    expect(cmdDoctor(cwd)).toBe(1);
    expect(logs.join("\n")).toContain("provider: google");
    expect(logs.join("\n")).toContain("data dir: " + join(home, "data"));
    expect(logs.join("\n")).toMatch(/Falta GOOGLE_API_KEY/);
    expect(logs.join("\n")).toContain("pendiente:");
  });

  it("is OK for google when a key is present", () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "google");
    vi.stubEnv("GOOGLE_API_KEY", "k");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    expect(cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("OK: listo para arrancar.");
    expect(logs.join("\n")).not.toContain("sin Google OAuth");
  });

  it("notes the Drive disconnect when no OAuth client id is configured", () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "google");
    vi.stubEnv("GOOGLE_API_KEY", "k");
    expect(cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("sin Google OAuth el chat funciona");
  });

  it("requires key and base url for openai-compatible", () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "openai-compatible");
    expect(cmdDoctor(cwd)).toBe(1);
    expect(logs.join("\n")).toMatch(/Falta OPENEXPERT_MODEL_KEY/);
    expect(logs.join("\n")).toMatch(/Falta OPENEXPERT_BASE_URL/);
  });

  it("is OK for a configured openai-compatible provider", () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "openai-compatible");
    vi.stubEnv("OPENEXPERT_MODEL_KEY", "k");
    vi.stubEnv("OPENEXPERT_BASE_URL", "https://api.example.com/v1");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    expect(cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("OK: listo para arrancar.");
  });

  it("reports the ollama endpoint and never blocks", () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "ollama");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    expect(cmdDoctor(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("ollama:   http://localhost:11434");
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
    expect(logs.join("\n")).toContain("Modelos en Ollama (http://localhost:11434):");
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
    expect(logs.join("\n")).toContain("No se puede contactar con Ollama");
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
    expect(logs.join("\n")).toContain("Configura OPENEXPERT_BASE_URL y OPENEXPERT_MODEL_KEY");
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
    expect(logs.join("\n")).toContain("No se pudo listar modelos");
  });

  it("points google users at AI Studio", async () => {
    vi.stubEnv("OPENEXPERT_MODEL_PROVIDER", "google");
    expect(await cmdModels(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("Proveedor google");
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
  it("removes the cached standalone server for the current version", () => {
    // packageVersion() is "0.0.0" from the source tree; build that cache dir.
    const dir = join(home, ".openexpert", "app", "0.0.0");
    mkdirSync(dir, { recursive: true });
    expect(cmdUpdate()).toBe(0);
    expect(existsSync(dir)).toBe(false);
    expect(logs.join("\n")).toContain("caché del servidor eliminada");
  });

  it("says there is nothing to update when no cache exists", () => {
    expect(cmdUpdate()).toBe(0);
    expect(logs.join("\n")).toContain("No hay servidor descargado que actualizar.");
  });
});
