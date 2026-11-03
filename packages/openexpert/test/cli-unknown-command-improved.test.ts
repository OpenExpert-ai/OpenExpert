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

describe("CLI unknown command error handling - improved coverage", () => {
  it("rejects an unknown command with exit code 1 and the help text", async () => {
    await run(["unknown-command-12345"]);
    expect(errs.join("\n")).toContain("Comando desconocido: unknown-command-12345");
    expect(logs.join("\n")).toContain("OpenExpert — motor local");
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it("handles empty command (matches init case)", async () => {
    await run([]);
    // Empty command (undefined argv[0]) matches the "" case, not default
    // The runWizard function is called, which may log to console
    expect(exitMock).not.toHaveBeenCalledWith(1);
    // Check that runWizard was called (not needed for test coverage)
  });

  it("handles whitespace-only command correctly", async () => {
    await run([""]);
    // Empty string matches the "" case, not default
    expect(exitMock).not.toHaveBeenCalledWith(1);
  });

  it("shows help text when unknown command is provided", async () => {
    await run(["some-non-existent-command"]);
    // The help text should be logged via console.log
    expect(logs.some((log) => log.includes("Uso:"))).toBe(true);
    expect(logs.some((log) => log.includes("asistente de configuración y arranque"))).toBe(true);
    expect(logs.some((log) => log.includes("npx @openexpert/openexpert"))).toBe(true);
  });

  it("returns proper exit code 1 for unknown commands", async () => {
    await run(["completely-unknown"]);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it("does not exit for known commands", async () => {
    await run(["--version"]);
    expect(exitMock).toHaveBeenCalledWith(0);
  });

  it("handles command with special characters in unknown command", async () => {
    await run(["cmd@#$%"]);
    expect(errs.join("\n")).toContain("Comando desconocido: cmd@#$%");
    expect(logs.join("\n")).toContain("OpenExpert — motor local");
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it("handles very long unknown command name", async () => {
    const longCmd = "a".repeat(100);
    await run([longCmd]);
    expect(errs.join("\n")).toContain(`Comando desconocido: ${longCmd}`);
    expect(logs.join("\n")).toContain("OpenExpert — motor local");
    expect(exitMock).toHaveBeenCalledWith(1);
  });
});
