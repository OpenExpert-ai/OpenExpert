// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(() => false),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  select: vi.fn(),
  text: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
}));

import * as p from "@clack/prompts";
import { runWizard } from "../src/cli/wizard.js";

let home: string;
let cwd: string;
let exitMock: ReturnType<typeof vi.spyOn>;

function setTty(value: boolean | undefined): void {
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "oe-wiz-home-"));
  cwd = mkdtempSync(join(tmpdir(), "oe-wiz-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("OPENEXPERT_DATA_DIR", join(home, "data"));
  exitMock = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  vi.clearAllMocks();
  vi.mocked(p.isCancel).mockReturnValue(false);
  vi.mocked(p.spinner).mockReturnValue({ start: vi.fn(), stop: vi.fn() } as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setTty(undefined);
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("runWizard (non-interactive)", () => {
  it("writes an ollama config without prompting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    const res = await runWizard({ cwd, assumeYes: true });
    expect(res).toMatchObject({ provider: "ollama", modelId: "llama3.1", started: false });
    expect(JSON.parse(readFileSync(join(cwd, "openexpert.json"), "utf8"))).toMatchObject({
      modelProvider: "ollama",
      modelId: "llama3.1",
    });
    expect(p.intro).not.toHaveBeenCalled();
  });

  it("uses the first detected model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ models: [{ name: "mistral" }] }), { status: 200 }),
      ),
    );
    const res = await runWizard({ cwd, assumeYes: true });
    expect(res.modelId).toBe("mistral");
  });

  it("treats a non-TTY stdin as non-interactive", async () => {
    setTty(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    const res = await runWizard({ cwd });
    expect(res.started).toBe(false);
    expect(existsSync(join(cwd, "openexpert.json"))).toBe(true);
  });
});

describe("runWizard (interactive)", () => {
  beforeEach(() => {
    setTty(true);
  });

  it("configures a local ollama model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ models: [{ name: "llama3.1" }] }), { status: 200 }),
      ),
    );
    vi.mocked(p.select).mockResolvedValueOnce("ollama").mockResolvedValueOnce("llama3.1");
    vi.mocked(p.confirm).mockResolvedValue(true);
    const res = await runWizard({ cwd });
    expect(res).toMatchObject({ provider: "ollama", modelId: "llama3.1", started: true });
    expect(readFileSync(join(cwd, "openexpert.json"), "utf8")).toContain(
      '"modelProvider": "ollama"',
    );
  });

  it("stores the Google key in secrets when Google is chosen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    vi.mocked(p.select).mockResolvedValueOnce("google");
    vi.mocked(p.password).mockResolvedValue("AIza-secret");
    vi.mocked(p.text).mockResolvedValue("gemini-2.5-flash");
    vi.mocked(p.confirm).mockResolvedValue(false);
    const res = await runWizard({ cwd });
    expect(res).toMatchObject({ provider: "google", modelId: "gemini-2.5-flash", started: false });
    expect(res.secrets.GOOGLE_API_KEY).toBe("AIza-secret");
    expect(JSON.parse(readFileSync(join(home, "data", "secrets.json"), "utf8"))).toEqual({
      GOOGLE_API_KEY: "AIza-secret",
    });
  });

  it("stores base url and key for an openai-compatible endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    vi.mocked(p.select).mockResolvedValueOnce("openai-compatible");
    vi.mocked(p.text)
      .mockResolvedValueOnce("https://api.example.com/v1")
      .mockResolvedValueOnce("gpt-4o-mini");
    vi.mocked(p.password).mockResolvedValue("sk-xyz");
    vi.mocked(p.confirm).mockResolvedValue(true);
    const res = await runWizard({ cwd });
    expect(res).toMatchObject({ provider: "openai-compatible", modelId: "gpt-4o-mini" });
    expect(res.secrets).toEqual({
      OPENEXPERT_BASE_URL: "https://api.example.com/v1",
      OPENEXPERT_MODEL_KEY: "sk-xyz",
    });
  });

  it("prints install instructions and exits when the user picks install-ollama", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    vi.mocked(p.select).mockResolvedValueOnce("install-ollama");
    // Model the real termination: process.exit does not return.
    exitMock.mockImplementation(((code: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    await expect(runWizard({ cwd })).rejects.toThrow("exit:0");
    expect(p.note).toHaveBeenCalled();
    expect(p.outro).toHaveBeenCalledWith("Sin cambios.");
    expect(existsSync(join(cwd, "openexpert.json"))).toBe(false);
  });

  it("bails out when the provider choice is cancelled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    vi.mocked(p.select).mockResolvedValueOnce(Symbol("cancel") as never);
    vi.mocked(p.isCancel).mockReturnValue(true);
    await runWizard({ cwd });
    expect(p.cancel).toHaveBeenCalled();
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it("bails out when the local model choice is cancelled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ models: [{ name: "llama3.1" }] }), { status: 200 }),
      ),
    );
    vi.mocked(p.select)
      .mockResolvedValueOnce("ollama")
      .mockResolvedValueOnce(Symbol("cancel") as never);
    vi.mocked(p.isCancel).mockReturnValueOnce(false).mockReturnValueOnce(true);
    exitMock.mockImplementation(((code: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    await expect(runWizard({ cwd })).rejects.toThrow("exit:1");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("bails out when the Google API key prompt is cancelled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    vi.mocked(p.select).mockResolvedValueOnce("google");
    vi.mocked(p.password).mockResolvedValue(Symbol("cancel") as never);
    vi.mocked(p.isCancel).mockReturnValueOnce(false).mockReturnValueOnce(true);
    exitMock.mockImplementation(((code: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    await expect(runWizard({ cwd })).rejects.toThrow("exit:1");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("bails out when the openai-compatible base URL prompt is cancelled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    vi.mocked(p.select).mockResolvedValueOnce("openai-compatible");
    vi.mocked(p.text).mockResolvedValue(Symbol("cancel") as never);
    vi.mocked(p.isCancel).mockReturnValueOnce(false).mockReturnValueOnce(true);
    exitMock.mockImplementation(((code: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    await expect(runWizard({ cwd })).rejects.toThrow("exit:1");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("merges into an existing openexpert.json instead of dropping unknown keys", async () => {
    mkdirSync(cwd, { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(cwd, "openexpert.json"), JSON.stringify({ modelId: "old", extra: 1 }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    vi.mocked(p.select).mockResolvedValueOnce("google");
    vi.mocked(p.password).mockResolvedValue("k");
    vi.mocked(p.text).mockResolvedValue("gemini-2.5-flash");
    vi.mocked(p.confirm).mockResolvedValue(false);
    await runWizard({ cwd });
    const cfg = JSON.parse(readFileSync(join(cwd, "openexpert.json"), "utf8"));
    expect(cfg.modelProvider).toBe("google");
    expect(cfg.modelId).toBe("gemini-2.5-flash");
  });
});
