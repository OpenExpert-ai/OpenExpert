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

  it("lleva la clave local y el estado de las integraciones a otra instalación", async () => {
    // The regression: the envelope carried credentials.json without secret.key, so a restore on
    // another machine brought back tokens nobody could decrypt and every integration read as
    // "not connected", with no warning.
    const origin = mkdtempSync(join(tmpdir(), "oe-backup-origin-"));
    const target = mkdtempSync(join(tmpdir(), "oe-backup-target-"));
    const secrets = await import("./engine/local-secrets.server");
    const previous = process.env["OPENEXPERT_DATA_DIR"];
    try {
      process.env["OPENEXPERT_DATA_DIR"] = origin;
      await dataStats(); // creates and seeds the database where the bundle is built
      secrets.saveTokens({
        access_token: "at-1",
        refresh_token: "rt-1",
        expires_at: "2030-01-01T00:00:00.000Z",
      });
      secrets.saveGrantedFiles([
        { id: "g1", name: "Hoja", mimeType: "text/csv", addedAt: "2026-01-01T00:00:00.000Z" },
      ]);
      secrets.saveLocalRoots([
        { path: "/tmp/documentos", name: "documentos", addedAt: "2026-01-01T00:00:00.000Z" },
      ]);
      secrets.saveNotionToken({
        access_token: "nt-1",
        workspace_id: "w1",
        workspace_name: "Espacio",
        bot_id: null,
        connected_at: "2026-01-01T00:00:00.000Z",
      });
      secrets.saveDriveConsent({
        at: "2026-01-01T00:00:00.000Z",
        privacyUrl: "https://example.test/p",
      });
      const key = readFileSync(join(origin, "secret.key"));

      const bundle = buildBackup();
      expect(bundle.version).toBe(2);
      for (const file of ["secretKey", "driveGrants", "localRoots", "notion", "driveConsent"]) {
        expect(bundle.files[file as keyof typeof bundle.files]).toBeTruthy();
      }

      process.env["OPENEXPERT_DATA_DIR"] = target;
      const result = await restoreBackup(JSON.stringify(bundle));

      expect(result.missing).toEqual([]);
      expect(result.applied).toEqual(
        expect.arrayContaining([
          "db",
          "credentials",
          "secretKey",
          "driveGrants",
          "localRoots",
          "notion",
          "driveConsent",
        ]),
      );
      expect(readFileSync(join(target, "secret.key")).equals(key)).toBe(true);
      // The point of carrying the key: the blobs restore as readable state.
      expect(secrets.loadTokens()?.access_token).toBe("at-1");
      expect(secrets.loadGrantedFiles().map((g) => g.id)).toEqual(["g1"]);
      expect(secrets.loadLocalRoots().map((r) => r.path)).toEqual(["/tmp/documentos"]);
      expect(secrets.loadNotionToken()?.workspace_name).toBe("Espacio");
      expect(secrets.loadDriveConsent()?.privacyUrl).toBe("https://example.test/p");
    } finally {
      if (previous === undefined) delete process.env["OPENEXPERT_DATA_DIR"];
      else process.env["OPENEXPERT_DATA_DIR"] = previous;
      rmSync(origin, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("declara lo que una copia de la versión 1 no podía llevar", async () => {
    await dataStats();
    const bundle = buildBackup();
    const v1 = {
      format: bundle.format,
      version: 1,
      createdAt: bundle.createdAt,
      files: { db: bundle.files.db! },
    };

    const result = await restoreBackup(JSON.stringify(v1));

    expect(result.missing).toEqual([
      "secretKey",
      "driveGrants",
      "localRoots",
      "notion",
      "driveConsent",
    ]);
  });

  it("avisa de la clave cuando la copia trae blobs cifrados y no la clave", async () => {
    await dataStats();
    const bundle = buildBackup();
    const bundleWithoutKey = {
      format: bundle.format,
      version: 2,
      files: {
        db: bundle.files.db!,
        credentials: Buffer.from("soy un token cifrado").toString("base64"),
      },
    };

    const result = await restoreBackup(JSON.stringify(bundleWithoutKey));

    expect(result.missing).toEqual(["secretKey"]);
    rmSync(join(dir, "credentials.json"), { force: true });
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
