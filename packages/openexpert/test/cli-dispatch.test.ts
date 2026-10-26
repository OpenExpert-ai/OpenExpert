// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/cli/commands.js", () => ({
  cmdVersion: vi.fn(() => 0),
  cmdDoctor: vi.fn(async () => 0),
  cmdFix: vi.fn(async () => 0),
  cmdModels: vi.fn(async () => 0),
  cmdServe: vi.fn(async () => 0),
  cmdUpdate: vi.fn(() => 0),
}));

vi.mock("../src/cli/desktop.js", () => ({
  cmdDesktop: vi.fn(async () => 0),
}));

vi.mock("../src/cli/wizard.js", () => ({
  runWizard: vi.fn(async () => ({
    config: {},
    secrets: {},
    provider: "ollama",
    modelId: "llama3.1",
    started: false,
  })),
}));

import { run } from "../src/cli.js";
import * as commands from "../src/cli/commands.js";
import * as desktop from "../src/cli/desktop.js";
import * as wizard from "../src/cli/wizard.js";

let logs: string[];
let errs: string[];
let exitMock: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  logs = [];
  errs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a) => void errs.push(a.join(" ")));
  exitMock = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  vi.mocked(commands.cmdServe).mockResolvedValue(0);
  vi.mocked(commands.cmdDoctor).mockResolvedValue(0);
  vi.mocked(commands.cmdVersion).mockReturnValue(0);
  vi.mocked(commands.cmdFix).mockResolvedValue(0);
  vi.mocked(commands.cmdModels).mockResolvedValue(0);
  vi.mocked(commands.cmdUpdate).mockReturnValue(0);
  vi.mocked(desktop.cmdDesktop).mockResolvedValue(0);
  vi.mocked(wizard.runWizard).mockResolvedValue({
    config: {},
    secrets: {},
    provider: "ollama",
    modelId: "llama3.1",
    started: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("run dispatch", () => {
  it("maps every version flag to cmdVersion", async () => {
    for (const flag of ["version", "--version", "-v"]) {
      exitMock.mockClear();
      vi.mocked(commands.cmdVersion).mockClear();
      await run([flag]);
      expect(commands.cmdVersion).toHaveBeenCalledTimes(1);
      expect(exitMock).toHaveBeenCalledWith(0);
    }
  });

  it("routes doctor, fix, models, serve/dev, desktop/app, update", async () => {
    await run(["doctor"]);
    expect(commands.cmdDoctor).toHaveBeenCalled();
    await run(["fix"]);
    expect(commands.cmdFix).toHaveBeenCalled();
    await run(["models"]);
    expect(commands.cmdModels).toHaveBeenCalled();
    await run(["dev"]);
    expect(commands.cmdServe).toHaveBeenCalled();
    await run(["app"]);
    expect(desktop.cmdDesktop).toHaveBeenCalled();
    await run(["update"]);
    expect(commands.cmdUpdate).toHaveBeenCalled();
  });

  it("propagates the desktop exit code", async () => {
    vi.mocked(desktop.cmdDesktop).mockResolvedValue(3);
    await run(["desktop"]);
    expect(exitMock).toHaveBeenCalledWith(3);
  });

  it("prints help for the help flags without exiting", async () => {
    await run(["--help"]);
    expect(logs.join("\n")).toContain("OpenExpert — motor local");
    expect(exitMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown command with exit code 1 and the help text", async () => {
    await run(["frobnicate"]);
    expect(errs.join("\n")).toContain("Comando desconocido: frobnicate");
    expect(logs.join("\n")).toContain("Uso:");
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it("runs the wizard for no-arg/init/setup and only serves when it started", async () => {
    await run([]);
    expect(wizard.runWizard).toHaveBeenCalledWith({});
    expect(commands.cmdServe).not.toHaveBeenCalled();

    vi.mocked(wizard.runWizard).mockResolvedValue({
      config: {},
      secrets: {},
      provider: "ollama",
      modelId: "llama3.1",
      started: true,
    });
    await run(["init"]);
    expect(commands.cmdServe).toHaveBeenCalled();
    expect(exitMock).toHaveBeenCalledWith(0);

    await run(["setup"]);
    expect(wizard.runWizard).toHaveBeenCalledTimes(3);
  });
});
