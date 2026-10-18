// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DATA_DIR,
  appCacheDir,
  configPath,
  detectOllama,
  ensureStandaloneApp,
  expandHome,
  findRepoRoot,
  httpGetJson,
  packageRoot,
  packageVersion,
  readConfig,
  readSecrets,
  resolvedDataDir,
  run,
  secretsAsEnv,
  secretsPath,
  writeConfig,
  writeSecrets,
  type Secrets,
} from "../src/cli/lib.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "oe-lib-"));
  vi.stubEnv("HOME", home);
  // Never let a stray var from the machine leak into the assertions below.
  for (const k of ["OPENEXPERT_DATA_DIR", "OPENEXPERT_HOST", "HOST", "XDG_DATA_HOME"]) {
    vi.stubEnv(k, "");
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(home, { recursive: true, force: true });
});

describe("expandHome", () => {
  it("expands the bare home and ~/ prefixes, leaves other paths alone", () => {
    expect(expandHome("~")).toBe(home);
    expect(expandHome("~/sub/dir")).toBe(join(home, "sub/dir"));
    expect(expandHome("/absolute/path")).toBe("/absolute/path");
    expect(expandHome("relative")).toBe("relative");
    expect(expandHome("~other")).toBe("~other");
  });
});

describe("packageRoot / packageVersion", () => {
  it("resolves the package root from the module location", () => {
    expect(packageRoot().endsWith(join("packages", "openexpert", "src"))).toBe(true);
  });

  it("returns a semver string, falling back to 0.0.0 when package.json is not reachable", () => {
    // From the source tree packageRoot() points at src/, which has no
    // package.json, so the documented fallback is what we get here.
    expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("findRepoRoot", () => {
  it("walks up to a checkout marked by package.json + packages/openexpert + vite.config.ts", () => {
    const root = mkdtempSync(join(tmpdir(), "oe-reporoot-"));
    try {
      mkdirSync(join(root, "packages", "openexpert"), { recursive: true });
      writeFileSync(join(root, "package.json"), "{}");
      writeFileSync(join(root, "vite.config.ts"), "");
      const nested = join(root, "packages", "openexpert", "src");
      mkdirSync(nested, { recursive: true });
      expect(findRepoRoot(nested)).toBe(root);
      expect(findRepoRoot(root)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null when no checkout marker is found", () => {
    const dir = mkdtempSync(join(tmpdir(), "oe-bare-"));
    try {
      expect(findRepoRoot(join(dir, "does", "not", "exist"))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("config read/write round-trip", () => {
  it("round-trips a config through openexpert.json", () => {
    const cwd = mkdtempSync(join(tmpdir(), "oe-cwd-"));
    try {
      expect(configPath(cwd)).toBe(join(cwd, "openexpert.json"));
      expect(readConfig(cwd)).toEqual({});
      writeConfig({ modelProvider: "ollama", modelId: "qwen2.5" }, cwd);
      const raw = readFileSync(configPath(cwd), "utf8");
      expect(raw.endsWith("\n")).toBe(true);
      expect(readConfig(cwd)).toEqual({ modelProvider: "ollama", modelId: "qwen2.5" });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("returns {} for a corrupt config file instead of throwing", () => {
    const cwd = mkdtempSync(join(tmpdir(), "oe-cwd-"));
    try {
      writeFileSync(configPath(cwd), "{ not json");
      expect(readConfig(cwd)).toEqual({});
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("resolvedDataDir", () => {
  it("defaults to ~/.openexpert expanded to the home directory", () => {
    const cwd = mkdtempSync(join(tmpdir(), "oe-cwd-"));
    try {
      expect(DEFAULT_DATA_DIR).toBe("~/.openexpert");
      expect(resolvedDataDir(cwd)).toBe(join(home, ".openexpert"));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("prefers OPENEXPERT_DATA_DIR over the file, and the file over the default", () => {
    const cwd = mkdtempSync(join(tmpdir(), "oe-cwd-"));
    try {
      writeConfig({ dataDir: "~/from-file" }, cwd);
      expect(resolvedDataDir(cwd)).toBe(join(home, "from-file"));
      vi.stubEnv("OPENEXPERT_DATA_DIR", "~/from-env");
      expect(resolvedDataDir(cwd)).toBe(join(home, "from-env"));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("secrets", () => {
  it("writes secrets.json with 0600 and reads them back", () => {
    const cwd = mkdtempSync(join(tmpdir(), "oe-cwd-"));
    try {
      vi.stubEnv("OPENEXPERT_DATA_DIR", join(home, "data"));
      expect(secretsPath(cwd)).toBe(join(home, "data", "secrets.json"));
      expect(readSecrets(cwd)).toEqual({});
      const p = writeSecrets({ GOOGLE_API_KEY: "abc" }, cwd);
      expect(p).toBe(join(home, "data", "secrets.json"));
      // The file must not be world/group readable.
      expect(statSync(p).mode & 0o777).toBe(0o600);
      expect(readSecrets(cwd)).toEqual({ GOOGLE_API_KEY: "abc" });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("ignores a corrupt secrets file", () => {
    const cwd = mkdtempSync(join(tmpdir(), "oe-cwd-"));
    try {
      vi.stubEnv("OPENEXPERT_DATA_DIR", join(home, "data"));
      mkdirSync(join(home, "data"), { recursive: true });
      writeFileSync(secretsPath(cwd), "not json");
      expect(readSecrets(cwd)).toEqual({});
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("secretsAsEnv drops empty values", () => {
    const cwd = mkdtempSync(join(tmpdir(), "oe-cwd-"));
    try {
      vi.stubEnv("OPENEXPERT_DATA_DIR", join(home, "data"));
      const s: Secrets = { GOOGLE_API_KEY: "k", OPENEXPERT_BASE_URL: "" };
      writeSecrets(s, cwd);
      expect(secretsAsEnv(cwd)).toEqual({ GOOGLE_API_KEY: "k" });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("httpGetJson", () => {
  it("returns parsed JSON for a 2xx response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ a: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      httpGetJson<{ a: number }>("http://x/y", { headers: { A: "b" } }),
    ).resolves.toEqual({
      a: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x/y",
      expect.objectContaining({ headers: { A: "b" } }),
    );
  });

  it("returns null on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );
    await expect(httpGetJson("http://x/y")).resolves.toBeNull();
  });

  it("returns null when the request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("boom"))),
    );
    await expect(httpGetJson("http://x/y")).resolves.toBeNull();
  });
});

describe("detectOllama", () => {
  it("reports up and maps model names from the native /api/tags endpoint", async () => {
    const fetchMock = vi.fn(
      async (_url: string) =>
        new Response(JSON.stringify({ models: [{ name: "llama3.1" }, { name: "qwen2.5" }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(detectOllama("http://localhost:11434/")).resolves.toEqual({
      up: true,
      models: ["llama3.1", "qwen2.5"],
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("http://localhost:11434/api/tags");
  });

  it("normalises a /v1 base back to the native root", async () => {
    const fetchMock = vi.fn(
      async (_url: string) => new Response(JSON.stringify({}), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(detectOllama("http://ollama:11434/v1")).resolves.toEqual({ up: true, models: [] });
    expect(fetchMock.mock.calls[0]![0]).toBe("http://ollama:11434/api/tags");
  });

  it("reports down when Ollama is not reachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))),
    );
    await expect(detectOllama()).resolves.toEqual({ up: false, models: [] });
  });
});

describe("appCacheDir", () => {
  it("nests under the data dir keyed by version", () => {
    expect(appCacheDir("1.2.3")).toBe(join(home, ".openexpert", "app", "1.2.3"));
  });
});

describe("ensureStandaloneApp", () => {
  function tarballWithEntry(): { bytes: Buffer; sha: string } {
    const tree = mkdtempSync(join(tmpdir(), "oe-tar-"));
    const out = mkdtempSync(join(tmpdir(), "oe-out-"));
    mkdirSync(join(tree, ".output", "server"), { recursive: true });
    writeFileSync(join(tree, ".output", "server", "index.mjs"), "console.log('ok');\n");
    // The archive must live outside `tree`: writing it inside makes tar abort
    // with "file changed as we read it".
    const tgz = join(out, "bundle.tar.gz");
    const r = spawnSync("tar", ["-czf", tgz, "-C", tree, "."], { stdio: "ignore" });
    expect(r.status).toBe(0);
    const bytes = readFileSync(tgz);
    rmSync(tree, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
    return { bytes, sha: createHash("sha256").update(bytes).digest("hex") };
  }

  it("reuses an already-extracted build without downloading", async () => {
    const dir = appCacheDir("9.9.9");
    mkdirSync(join(dir, ".output", "server"), { recursive: true });
    writeFileSync(join(dir, ".output", "server", "index.mjs"), "// built");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(ensureStandaloneApp("9.9.9")).resolves.toBe(dir);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("downloads, verifies the checksum and extracts the bundle", async () => {
    const { bytes, sha } = tarballWithEntry();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith(".sha256")) return new Response(`${sha}  bundle.tar.gz\n`, { status: 200 });
      if (url.endsWith(".tar.gz")) return new Response(bytes, { status: 200 });
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const logs: string[] = [];
    const dir = await ensureStandaloneApp("1.0.0", { log: (m) => logs.push(m) });
    expect(dir).toBe(appCacheDir("1.0.0"));
    expect(existsSync(join(dir!, ".output", "server", "index.mjs"))).toBe(true);
    // The first candidate tag is v<version>.
    expect(fetchMock.mock.calls[0]![0]).toContain("/releases/download/v1.0.0/");
    expect(logs.some((l) => l.startsWith("downloading "))).toBe(true);
  });

  it("aborts when the published checksum does not match", async () => {
    const { bytes } = tarballWithEntry();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith(".sha256")) return new Response("deadbeef\n", { status: 200 });
      if (url.endsWith(".tar.gz")) return new Response(bytes, { status: 200 });
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const logs: string[] = [];
    await expect(ensureStandaloneApp("2.0.0", { log: (m) => logs.push(m) })).resolves.toBeNull();
    expect(logs).toContain("checksum mismatch, aborting");
    expect(existsSync(join(appCacheDir("2.0.0"), ".output"))).toBe(false);
  });

  it("returns null when no release asset is available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    await expect(ensureStandaloneApp("3.0.0")).resolves.toBeNull();
  });
});

describe("run", () => {
  it("resolves with the child's exit code", async () => {
    await expect(run(process.execPath, ["-e", "process.exit(3)"])).resolves.toBe(3);
  });

  it("resolves 0 when the process exits cleanly", async () => {
    await expect(run(process.execPath, ["-e", ""])).resolves.toBe(0);
  });
});
