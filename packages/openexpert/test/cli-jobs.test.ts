// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// spawnSync is how the command talks to systemd; the tests decide what it says.
const child = vi.hoisted(() => ({ spawnSync: vi.fn(), spawn: vi.fn() }));
vi.mock("node:child_process", () => child);

// Only what reaches the network or a directory outside the test is replaced:
// the secrets helpers stay real.
vi.mock("../src/cli/lib.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/cli/lib.js")>();
  return {
    ...actual,
    run: vi.fn(async () => 0),
    findRepoRoot: vi.fn(() => null),
    ensureStandaloneApp: vi.fn(async () => null),
  };
});

import { cmdJobs, unitFiles } from "../src/cli/jobs.js";
import { ensureStandaloneApp, findRepoRoot, readSecrets, run } from "../src/cli/lib.js";

let root: string;
let home: string;
let app: string;
let previousHome: string | undefined;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "openexpert-cli-jobs-"));
  process.env["OPENEXPERT_DATA_DIR"] = join(root, "data");
});
afterAll(() => {
  delete process.env["OPENEXPERT_DATA_DIR"];
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  home = mkdtempSync(join(root, "home-"));
  previousHome = process.env["HOME"];
  process.env["HOME"] = home;
  app = mkdtempSync(join(root, "app-"));
  vi.mocked(findRepoRoot).mockReturnValue(app);
  vi.mocked(ensureStandaloneApp).mockResolvedValue(null);
  vi.mocked(run).mockResolvedValue(0);
  child.spawnSync.mockReturnValue({ status: 0, stdout: "" });
});
afterEach(() => {
  if (previousHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = previousHome;
  vi.clearAllMocks();
});

/** A checkout that already has the headless bundle. */
function withRunner(): string {
  const entry = join(app, ".output", "jobs", "index.mjs");
  mkdirSync(join(app, ".output", "jobs"), { recursive: true });
  writeFileSync(entry, "// bundle\n");
  return entry;
}

describe("systemd units", () => {
  const base = { node: "/usr/bin/node", entry: "/app/.output/jobs/index.mjs", workdir: "/home/me" };

  it("runs the headless entry once per timer tick, from the configured directory", () => {
    const { service, timer } = unitFiles(base);
    expect(service).toContain('ExecStart="/usr/bin/node" "/app/.output/jobs/index.mjs" run');
    expect(service).toContain("WorkingDirectory=/home/me");
    expect(service).toContain("Type=oneshot");
    expect(service).not.toContain("OPENEXPERT_DATA_DIR");
    expect(timer).toContain("OnCalendar=*:0/15");
    expect(timer).toContain("Persistent=true");
    expect(timer).toContain("WantedBy=timers.target");
  });

  it("pins the data directory when one is given and honours the interval", () => {
    const { service, timer } = unitFiles({ ...base, dataDir: "/data/x", intervalMinutes: 5 });
    expect(service).toContain('Environment="OPENEXPERT_DATA_DIR=/data/x"');
    expect(timer).toContain("OnCalendar=*:0/5");
  });

  it("keeps a path with spaces as one argument", () => {
    const { service } = unitFiles({ ...base, entry: "/mi app/.output/jobs/index.mjs" });
    expect(service).toContain('"/mi app/.output/jobs/index.mjs"');
  });
});

describe("run", () => {
  it("executes the headless entry in this directory and returns its code", async () => {
    const entry = withRunner();
    vi.mocked(run).mockResolvedValue(3);
    expect(await cmdJobs(["run"])).toBe(3);
    expect(run).toHaveBeenCalledWith(process.execPath, [entry, "run"], { cwd: process.cwd() });
  });

  it("defaults to run when no subcommand is given", async () => {
    withRunner();
    expect(await cmdJobs()).toBe(0);
    expect(run).toHaveBeenCalled();
  });

  it("explains the missing build instead of spawning nothing", async () => {
    vi.mocked(findRepoRoot).mockReturnValue(join(root, "sin-build"));
    expect(await cmdJobs(["run"])).toBe(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("uses the downloaded server when there is no checkout", async () => {
    vi.mocked(findRepoRoot).mockReturnValue(null);
    const cached = mkdtempSync(join(root, "cache-"));
    mkdirSync(join(cached, ".output", "jobs"), { recursive: true });
    writeFileSync(join(cached, ".output", "jobs", "index.mjs"), "// bundle\n");
    vi.mocked(ensureStandaloneApp).mockResolvedValue(cached);
    expect(await cmdJobs(["run"])).toBe(0);
    expect(run).toHaveBeenCalledWith(
      process.execPath,
      [join(cached, ".output", "jobs", "index.mjs"), "run"],
      { cwd: process.cwd() },
    );
  });
});

describe("install", () => {
  it("writes both units and enables the timer", async () => {
    withRunner();
    expect(await cmdJobs(["install"])).toBe(0);
    expect(existsSync(join(home, ".config", "systemd", "user", "openexpert-jobs.service"))).toBe(
      true,
    );
    expect(existsSync(join(home, ".config", "systemd", "user", "openexpert-jobs.timer"))).toBe(
      true,
    );
    expect(child.spawnSync).toHaveBeenCalledWith(
      "systemctl",
      ["--user", "enable", "--now", "openexpert-jobs.timer"],
      { stdio: "inherit" },
    );
  });

  it("keeps the files and says how to enable them when systemd does not answer", async () => {
    withRunner();
    child.spawnSync.mockReturnValue({ status: 1 });
    expect(await cmdJobs(["install"])).toBe(1);
    expect(existsSync(join(home, ".config", "systemd", "user", "openexpert-jobs.timer"))).toBe(
      true,
    );
  });

  it("refuses outside Linux", async () => {
    withRunner();
    const platform = vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    try {
      expect(await cmdJobs(["install"])).toBe(1);
    } finally {
      platform.mockRestore();
    }
  });

  it("reports a timer that systemd refuses to enable", async () => {
    withRunner();
    child.spawnSync.mockImplementation((_cmd: string, args: string[]) => ({
      status: args.includes("show-environment") ? 0 : 1,
      stdout: "",
    }));
    expect(await cmdJobs(["install"])).toBe(1);
  });

  it("leaves the data directory out of the unit when it is not set", async () => {
    withRunner();
    const previous = process.env["OPENEXPERT_DATA_DIR"];
    delete process.env["OPENEXPERT_DATA_DIR"];
    try {
      expect(await cmdJobs(["install"])).toBe(0);
    } finally {
      if (previous !== undefined) process.env["OPENEXPERT_DATA_DIR"] = previous;
    }
    const service = join(home, ".config", "systemd", "user", "openexpert-jobs.service");
    expect(String(readFileSync(service, "utf8"))).not.toContain("OPENEXPERT_DATA_DIR");
  });
});

describe("no runner available", () => {
  it("fails and says why when nothing is built or downloaded", async () => {
    vi.mocked(findRepoRoot).mockReturnValue(null);
    vi.mocked(ensureStandaloneApp).mockResolvedValue(null);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await cmdJobs(["run"])).toBe(1);
      expect(await cmdJobs(["status"])).toBe(1);
    } finally {
      error.mockRestore();
    }
  });
});

describe("uninstall and status", () => {
  it("removes the units", async () => {
    withRunner();
    await cmdJobs(["install"]);
    expect(await cmdJobs(["uninstall"])).toBe(0);
    expect(existsSync(join(home, ".config", "systemd", "user", "openexpert-jobs.timer"))).toBe(
      false,
    );
  });

  it("reports the timer and runs the headless status", async () => {
    const entry = withRunner();
    child.spawnSync.mockReturnValue({ status: 0, stdout: "active\n" });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      expect(await cmdJobs(["status"])).toBe(0);
    } finally {
      log.mockRestore();
    }
    expect(run).toHaveBeenCalledWith(process.execPath, [entry, "status"], {
      cwd: process.cwd(),
    });
  });
});

describe("unknown subcommand", () => {
  it("prints usage and fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await cmdJobs(["bogus"])).toBe(2);
    } finally {
      error.mockRestore();
    }
  });
});

describe("stored passphrase", () => {
  it("is written where the app reads it", async () => {
    const previous = process.env["OPENEXPERT_BACKUP_PASSPHRASE"];
    process.env["OPENEXPERT_BACKUP_PASSPHRASE"] = "frase-de-prueba";
    try {
      expect(await cmdJobs(["passphrase"])).toBe(0);
    } finally {
      if (previous === undefined) delete process.env["OPENEXPERT_BACKUP_PASSPHRASE"];
      else process.env["OPENEXPERT_BACKUP_PASSPHRASE"] = previous;
    }
    expect(readSecrets()["BACKUP_PASSPHRASE"]).toBe("frase-de-prueba");
    expect(await cmdJobs(["passphrase", "--clear"])).toBe(0);
    expect(readSecrets()["BACKUP_PASSPHRASE"]).toBeUndefined();
  });

  it("refuses a short passphrase", async () => {
    process.env["OPENEXPERT_BACKUP_PASSPHRASE"] = "corta";
    try {
      expect(await cmdJobs(["passphrase"])).toBe(1);
    } finally {
      delete process.env["OPENEXPERT_BACKUP_PASSPHRASE"];
    }
    expect(readSecrets()["BACKUP_PASSPHRASE"]).toBeUndefined();
  });
});
