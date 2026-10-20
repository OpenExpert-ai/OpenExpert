// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    const result = await restoreBackup(JSON.stringify(bundle));
    expect(result.applied).toContain("db");

    await resetData();
    expect(existsSync(join(dir, "openexpert.db"))).toBe(true);
    const stats = await dataStats();
    expect(stats.experts).toBeGreaterThan(0);
    expect(stats.chatMessages).toBe(0);
  });

  it("refuses a bundle that is not a database and leaves the current one untouched", async () => {
    // The regression: the bytes were renamed over the real database without being opened, so a
    // corrupt bundle left an installation that could not start and had no way back.
    await dataStats();
    const dbFile = join(dir, "openexpert.db");
    const before = readFileSync(dbFile);
    const bundle = {
      format: "openexpert-backup",
      version: 1,
      files: { db: Buffer.from("esto no es una base de datos").toString("base64") },
    };

    await expect(restoreBackup(JSON.stringify(bundle))).rejects.toThrow(
      /no contiene una base de datos válida/,
    );
    expect(readFileSync(dbFile).equals(before)).toBe(true);
  });

  it("refuses a truncated database that still carries the SQLite header", async () => {
    // The header is not enough: a file cut in half keeps it and sql.js then throws on open.
    await dataStats();
    const dbFile = join(dir, "openexpert.db");
    const before = readFileSync(dbFile);
    const broken = Buffer.concat([
      Buffer.from("SQLite format 3\u0000", "latin1"),
      Buffer.from("<html>portal cautivo</html>".repeat(20)),
    ]);
    const bundle = {
      format: "openexpert-backup",
      version: 1,
      files: { db: broken.toString("base64") },
    };

    await expect(restoreBackup(JSON.stringify(bundle))).rejects.toThrow(/no es válida|válida/);
    expect(readFileSync(dbFile).equals(before)).toBe(true);
  });

  it("keeps a copy of the database it replaced and says where it is", async () => {
    await dataStats();
    const dbFile = join(dir, "openexpert.db");
    const previous = readFileSync(dbFile);
    const bundle = buildBackup();

    const result = await restoreBackup(JSON.stringify(bundle));
    expect(result.backupPath).toBe(`${dbFile}.bak`);
    expect(existsSync(result.backupPath!)).toBe(true);
    expect(readFileSync(result.backupPath!).equals(previous)).toBe(true);
  });

  it("rejects an unknown format", async () => {
    await expect(
      restoreBackup(JSON.stringify({ format: "nope", version: 1, files: {} })),
    ).rejects.toThrow();
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
