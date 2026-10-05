// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBackup, dataStats, resetData, restoreBackup } from "./backup.server";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "oe-backup-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  delete process.env["OPENEXPERT_DATA_DIR"];
  rmSync(dir, { recursive: true, force: true });
});

describe("backups", () => {
  it("seeds the database and builds a bundle", async () => {
    const stats = await dataStats();
    expect(stats.experts).toBeGreaterThan(0);
    const bundle = buildBackup();
    expect(bundle.format).toBe("openexpert-backup");
    expect(bundle.files.db).toBeTruthy();
  });

  it("restores a backup and resets to initial data", async () => {
    const bundle = buildBackup();
    const result = restoreBackup(JSON.stringify(bundle));
    expect(result.applied).toContain("db");

    await resetData();
    expect(existsSync(join(dir, "openexpert.db"))).toBe(true);
    const stats = await dataStats();
    expect(stats.experts).toBeGreaterThan(0);
    expect(stats.chatMessages).toBe(0);
  });

  it("rejects an unknown format", () => {
    expect(() =>
      restoreBackup(JSON.stringify({ format: "nope", version: 1, files: {} })),
    ).toThrow();
  });

  it("clears chat history and reports the count", async () => {
    const { getDb, persist } = await import("./db.server");
    const { clearChatHistory, dataStats } = await import("./backup.server");
    const schema = await import("../../drizzle/schema");
    const { orm } = await getDb();
    orm
      .insert(schema.chatMessages)
      .values({
        id: "m1",
        expertId: "general",
        conversationId: "c1",
        message: { role: "user" } as never,
        createdAt: new Date().toISOString(),
      })
      .run();
    await persist();
    expect((await dataStats()).chatMessages).toBeGreaterThan(0);
    expect(await clearChatHistory()).toBeGreaterThan(0);
    expect((await dataStats()).chatMessages).toBe(0);
  });

  it("vacuum runs without throwing", async () => {
    const { vacuumDb } = await import("./backup.server");
    await expect(vacuumDb()).resolves.toBeUndefined();
  });
});
