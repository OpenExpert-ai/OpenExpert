// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("HOME", "/home/tester");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("credentialsPath", () => {
  it("expands a ~/ dataDir against HOME", async () => {
    const { credentialsPath } = await import("../src/secrets.js");
    expect(credentialsPath("~/.openexpert")).toBe("/home/tester/.openexpert/credentials.json");
  });

  it("uses an absolute dataDir as-is and trims a trailing slash", async () => {
    const { credentialsPath } = await import("../src/secrets.js");
    expect(credentialsPath("/var/lib/openexpert")).toBe("/var/lib/openexpert/credentials.json");
    expect(credentialsPath("/var/lib/openexpert/")).toBe("/var/lib/openexpert/credentials.json");
  });
});

describe("storage catalog", () => {
  it("exposes the local table list", async () => {
    const { LOCAL_TABLES } = await import("../src/storage.js");
    expect(LOCAL_TABLES).toHaveLength(9);
    expect(LOCAL_TABLES).toContain("settings");
    expect(new Set(LOCAL_TABLES).size).toBe(LOCAL_TABLES.length);
  });
});

describe("index re-exports", () => {
  it("re-exports the public surface", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.loadConfig).toBe("function");
    expect(typeof mod.selectModel).toBe("function");
    expect(typeof mod.credentialsPath).toBe("function");
    expect(Array.isArray(mod.TOOL_CATALOG)).toBe(true);
    expect(Array.isArray(mod.LOCAL_TABLES)).toBe(true);
  });
});
