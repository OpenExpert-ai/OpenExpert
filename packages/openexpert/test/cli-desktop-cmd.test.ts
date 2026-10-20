// SPDX-License-Identifier: MIT
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/cli/lib.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/cli/lib.js")>();
  return {
    ...actual,
    findRepoRoot: vi.fn(actual.findRepoRoot),
    ensureStandaloneApp: vi.fn(actual.ensureStandaloneApp),
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn() };
});

import { spawn, type ChildProcess } from "node:child_process";
import { ensureStandaloneApp, findRepoRoot } from "../src/cli/lib.js";
import { cmdDesktop } from "../src/cli/desktop.js";

const spawnMock = vi.mocked(spawn);
const findRepoRootMock = vi.mocked(findRepoRoot);
const ensureAppMock = vi.mocked(ensureStandaloneApp);

const OPENEXPERT_HEADERS = {
  "x-request-id": "156e1ba5-249b-47e4-88dd-7267b60a2f5b",
  "x-frame-options": "DENY",
};

function fakeChild(): ChildProcess {
  const c = new EventEmitter() as unknown as {
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    emit: (event: string, ...args: unknown[]) => boolean;
  };
  c.killed = false;
  c.kill = vi.fn();
  return c as unknown as ChildProcess;
}

let home: string;
let cwd: string;
let binPath: string;
let logs: string[];
let errs: string[];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "oe-desk-home-"));
  cwd = mkdtempSync(join(tmpdir(), "oe-desk-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("OPENEXPERT_DATA_DIR", join(home, "data"));
  vi.stubEnv("OPENEXPERT_DESKTOP_REPO", "");
  vi.stubEnv("PORT", "");
  vi.stubEnv("OPENEXPERT_HOST", "");
  vi.stubEnv("HOST", "");

  // A real file so findDesktopBinary (which checks existsSync) accepts it.
  binPath = join(home, "openexpert-desktop");
  writeFileSync(binPath, "#!/bin/sh\n");
  vi.stubEnv("OPENEXPERT_DESKTOP_BIN", binPath);

  findRepoRootMock.mockReset().mockReturnValue(null);
  ensureAppMock.mockReset();
  spawnMock.mockReset();
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

describe("cmdDesktop", () => {
  it("fails clearly when the desktop window binary is missing", async () => {
    vi.stubEnv("OPENEXPERT_DESKTOP_BIN", "");
    expect(await cmdDesktop(cwd)).toBe(1);
    expect(errs.join("\n")).toContain("No se encontró la ventana de escritorio");
    expect(errs.join("\n")).toContain("npx tauri build");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("refuses to reuse a port occupied by an unrelated app", async () => {
    // An Express service that answers 404 without the OpenExpert headers.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("Cannot GET /", { status: 404, headers: { "x-powered-by": "Express" } }),
      ),
    );
    expect(await cmdDesktop(cwd)).toBe(1);
    expect(errs.join("\n")).toContain("está ocupado por otra aplicación");
    expect(errs.join("\n")).toContain("ss -ltnp | grep :3000");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("reuses an already-running OpenExpert server and opens the window", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 200, headers: OPENEXPERT_HEADERS })),
    );
    spawnMock.mockImplementation((cmd: string) => {
      const c = fakeChild();
      if (cmd === binPath) process.nextTick(() => (c as unknown as EventEmitter).emit("exit", 0));
      return c;
    });
    expect(await cmdDesktop(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("Usando el servidor ya activo en http://localhost:3000");
    expect(logs.join("\n")).toContain("Abriendo la ventana de OpenExpert");
    expect(spawnMock).toHaveBeenCalledWith(binPath, [], expect.objectContaining({}));
    // The reused server must not be killed on shutdown (we did not start it).
  });

  it("tells the window which port it serves instead of the compiled 3000", async () => {
    // `PORT=3100 openexpert`: the window used to load http://localhost:3000 no
    // matter what the CLI served, so it showed a blank page (or another app).
    vi.stubEnv("PORT", "3100");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 200, headers: OPENEXPERT_HEADERS })),
    );
    spawnMock.mockImplementation((cmd: string) => {
      const c = fakeChild();
      if (cmd === binPath) process.nextTick(() => (c as unknown as EventEmitter).emit("exit", 0));
      return c;
    });

    expect(await cmdDesktop(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("Usando el servidor ya activo en http://localhost:3100");
    expect(spawnMock).toHaveBeenLastCalledWith(
      binPath,
      [],
      expect.objectContaining({
        env: expect.objectContaining({ OPENEXPERT_DESKTOP_URL: "http://localhost:3100" }),
      }),
    );
  });

  it("starts the standalone server when nothing is listening, then opens the window", async () => {
    const app = join(home, "app");
    mkdirSync(join(app, ".output", "server"), { recursive: true });
    writeFileSync(join(app, ".output", "server", "index.mjs"), "// built");
    ensureAppMock.mockResolvedValue(app);

    let probes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        probes += 1;
        if (probes === 1) throw new Error("ECONNREFUSED");
        return new Response("", { status: 200, headers: OPENEXPERT_HEADERS });
      }),
    );
    const children: ChildProcess[] = [];
    spawnMock.mockImplementation((cmd: string) => {
      const c = fakeChild();
      children.push(c);
      if (cmd === binPath) process.nextTick(() => (c as unknown as EventEmitter).emit("exit", 0));
      return c;
    });

    expect(await cmdDesktop(cwd)).toBe(0);
    expect(logs.join("\n")).toContain("Arrancando el servidor local");
    const entry = join(app, ".output", "server", "index.mjs");
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [entry],
      expect.objectContaining({
        cwd: app,
        env: expect.objectContaining({ PORT: "3000", HOST: "127.0.0.1" }),
      }),
    );
    // The window runs after the server.
    expect(spawnMock).toHaveBeenLastCalledWith(binPath, [], expect.anything());
    // We started the server, so it must be stopped when the window closes.
    const serverChild = children[0] as unknown as { kill: ReturnType<typeof vi.fn> };
    expect(serverChild.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("falls back to `npm run dev` when a checkout has no build", async () => {
    const repo = mkdtempSync(join(tmpdir(), "oe-repo-"));
    try {
      findRepoRootMock.mockReturnValue(repo);
      let probes = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          probes += 1;
          if (probes === 1) throw new Error("ECONNREFUSED");
          return new Response("", { status: 200, headers: OPENEXPERT_HEADERS });
        }),
      );
      spawnMock.mockImplementation((cmd: string) => {
        const c = fakeChild();
        if (cmd === binPath) process.nextTick(() => (c as unknown as EventEmitter).emit("exit", 0));
        return c;
      });
      expect(await cmdDesktop(cwd)).toBe(0);
      expect(logs.join("\n")).toContain("modo desarrollo (no hay build)");
      expect(spawnMock).toHaveBeenCalledWith(
        "npm",
        ["run", "dev"],
        expect.objectContaining({ cwd: repo }),
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("runs a fresh production build directly with node", async () => {
    const repo = mkdtempSync(join(tmpdir(), "oe-repo-"));
    try {
      mkdirSync(join(repo, ".output", "server"), { recursive: true });
      const built = join(repo, ".output", "server", "index.mjs");
      writeFileSync(built, "// built");
      findRepoRootMock.mockReturnValue(repo);
      let probes = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          probes += 1;
          if (probes === 1) throw new Error("ECONNREFUSED");
          return new Response("", { status: 200, headers: OPENEXPERT_HEADERS });
        }),
      );
      spawnMock.mockImplementation((cmd: string) => {
        const c = fakeChild();
        if (cmd === binPath) process.nextTick(() => (c as unknown as EventEmitter).emit("exit", 0));
        return c;
      });
      expect(await cmdDesktop(cwd)).toBe(0);
      expect(spawnMock).toHaveBeenCalledWith(
        process.execPath,
        [built],
        expect.objectContaining({
          cwd: repo,
          env: expect.objectContaining({ NODE_ENV: "production" }),
        }),
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("falls back to dev mode when the build is older than src/", async () => {
    const repo = mkdtempSync(join(tmpdir(), "oe-repo-"));
    try {
      mkdirSync(join(repo, ".output", "server"), { recursive: true });
      mkdirSync(join(repo, "src"), { recursive: true });
      const built = join(repo, ".output", "server", "index.mjs");
      writeFileSync(built, "// built");
      writeFileSync(join(repo, "src", "server.ts"), "// new source");
      // Make the build clearly older than the sources.
      const old = new Date(1_000);
      utimesSync(built, old, old);
      findRepoRootMock.mockReturnValue(repo);
      let probes = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          probes += 1;
          if (probes === 1) throw new Error("ECONNREFUSED");
          return new Response("", { status: 200, headers: OPENEXPERT_HEADERS });
        }),
      );
      spawnMock.mockImplementation((cmd: string) => {
        const c = fakeChild();
        if (cmd === binPath) process.nextTick(() => (c as unknown as EventEmitter).emit("exit", 0));
        return c;
      });
      expect(await cmdDesktop(cwd)).toBe(0);
      expect(logs.join("\n")).toContain("La build está desactualizada");
      expect(spawnMock).toHaveBeenCalledWith(
        "npm",
        ["run", "dev"],
        expect.objectContaining({ cwd: repo }),
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("kills the server and fails when it never answers", async () => {
    const app = join(home, "app");
    mkdirSync(join(app, ".output", "server"), { recursive: true });
    writeFileSync(join(app, ".output", "server", "index.mjs"), "// built");
    ensureAppMock.mockResolvedValue(app);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))),
    );
    const children: ChildProcess[] = [];
    spawnMock.mockImplementation(() => {
      const c = fakeChild();
      children.push(c);
      return c;
    });

    vi.useFakeTimers();
    try {
      const pending = cmdDesktop(cwd);
      await vi.advanceTimersByTimeAsync(130_000);
      expect(await pending).toBe(1);
    } finally {
      vi.useRealTimers();
    }
    expect(errs.join("\n")).toContain("El servidor no respondió a tiempo");
    const serverChild = children[0] as unknown as { kill: ReturnType<typeof vi.fn> };
    expect(serverChild.kill).toHaveBeenCalledWith("SIGTERM");
    // The window was never opened.
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
