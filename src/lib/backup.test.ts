// SPDX-License-Identifier: MIT
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
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildBackup, dataStats, resetData, restoreBackup } from "./backup.server";
import { resetDbHandle } from "./db.server";

/**
 * Makes one rename fail while the restore is swapping files in. The copies the
 * restore keeps beforehand work, so the failure happens exactly where a real
 * destination that cannot be replaced fails: at the swap, with earlier files
 * already in place.
 */
const renameControl = vi.hoisted(() => ({ failWhenSourceEndsWith: null as string | null }));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    renameSync: (
      from: Parameters<typeof real.renameSync>[0],
      to: Parameters<typeof real.renameSync>[1],
    ) => {
      if (
        renameControl.failWhenSourceEndsWith &&
        String(from).endsWith(renameControl.failWhenSourceEndsWith)
      ) {
        // The text POSIX gives for a file renamed over a directory.
        throw Object.assign(
          new Error(
            `EISDIR: illegal operation on a directory, rename '${String(from)}' -> '${String(to)}'`,
          ),
          { code: "EISDIR" },
        );
      }
      return real.renameSync(from, to);
    },
  };
});

/** The error the restore throws, for a case that has to fail. */
async function rejectionOf(work: Promise<unknown>): Promise<Error> {
  try {
    await work;
  } catch (e) {
    return e as Error;
  }
  throw new Error("la restauración terminó bien cuando tenía que fallar");
}

/** A bundle with those files, base64-encoded the way `buildBackup` does it. */
function bundleOf(files: Record<string, Buffer | string>): string {
  const encoded: Record<string, string> = {};
  for (const [key, value] of Object.entries(files)) {
    encoded[key] = Buffer.from(value).toString("base64");
  }
  return JSON.stringify({ format: "openexpert-backup", version: 2, files: encoded });
}

/**
 * An installation of its own in two temporary directories: a seeded database
 * (whose bytes the bundle must not be carrying, so a chat message is written
 * after the bundle is read), `openexpert.json` in the working directory and
 * `secrets.json` in the data directory. The environment and the working
 * directory end up pointing at it, so the caller has to restore them.
 */
async function installCurrent(): Promise<{ data: string; cwd: string; dbBlob: string }> {
  const data = mkdtempSync(join(tmpdir(), "oe-restore-data-"));
  const cwd = mkdtempSync(join(tmpdir(), "oe-restore-cwd-"));
  process.env["OPENEXPERT_DATA_DIR"] = data;
  process.chdir(cwd);
  resetDbHandle();
  await dataStats(); // creates and seeds the database here
  // What a bundle built before this installation had its own chat would carry.
  const dbBlob = buildBackup().files.db!;
  const { getDb, persist } = await import("./db.server");
  const schema = await import("../../drizzle/schema");
  const { orm } = await getDb();
  orm
    .insert(schema.chatMessages)
    .values({
      id: "propia",
      expertId: "general",
      conversationId: "c1",
      message: { role: "user" } as never,
      createdAt: new Date().toISOString(),
    })
    .run();
  await persist();
  writeFileSync(
    join(cwd, "openexpert.json"),
    JSON.stringify({ modelProvider: "ollama", modelId: "viejo" }),
  );
  writeFileSync(join(data, "secrets.json"), JSON.stringify({ CLAVE: "vieja" }));
  return { data, cwd, dbBlob };
}

/** Points the process back where it was and removes the installation. */
function dropInstallation(
  install: { data: string; cwd: string },
  previous: { dir: string | undefined; cwd: string },
): void {
  process.chdir(previous.cwd);
  if (previous.dir === undefined) delete process.env["OPENEXPERT_DATA_DIR"];
  else process.env["OPENEXPERT_DATA_DIR"] = previous.dir;
  resetDbHandle();
  rmSync(install.cwd, { recursive: true, force: true });
  rmSync(install.data, { recursive: true, force: true });
}

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

  it("deja la instalación como estaba si un fichero de la copia no se puede sustituir", async () => {
    // The regression: the files were renamed one by one and the catch put only the
    // database back, so a failure at the last one left the previous database next to
    // the bundle's configuration and secrets, and the message named the database
    // alone. A destination that cannot be replaced has to leave all four as they were.
    const previous = { dir: process.env["OPENEXPERT_DATA_DIR"], cwd: process.cwd() };
    const install = await installCurrent();
    const bundleDb = install.dbBlob;
    try {
      const db = join(install.data, "openexpert.db");
      const config = join(install.cwd, "openexpert.json");
      const secrets = join(install.data, "secrets.json");
      const credentials = join(install.data, "credentials.json");
      mkdirSync(credentials); // a directory: the staged file cannot be renamed over it
      const before = {
        db: readFileSync(db),
        config: readFileSync(config),
        secrets: readFileSync(secrets),
      };
      expect(before.db.equals(Buffer.from(bundleDb, "base64"))).toBe(false);

      const error = await rejectionOf(
        restoreBackup(
          bundleOf({
            db: Buffer.from(bundleDb, "base64"),
            config: JSON.stringify({ modelProvider: "openai", modelId: "nuevo" }),
            secrets: JSON.stringify({ CLAVE: "nueva" }),
            credentials: JSON.stringify({ token: "nuevo" }),
          }),
        ),
      );

      expect(readFileSync(db).equals(before.db)).toBe(true);
      expect(readFileSync(config).equals(before.config)).toBe(true);
      expect(readFileSync(secrets).equals(before.secrets)).toBe(true);
      expect(statSync(credentials).isDirectory()).toBe(true);
      expect(error.message).toMatch(/credentials\.json/);
      expect(error.message).toMatch(/No se ha cambiado nada/);
      // Neither the staged copies nor the ones kept aside survive a restore that did
      // not happen: a `secrets.json.pre-restore` left behind is a copy of the tokens.
      for (const path of [db, config, secrets, credentials]) {
        expect(existsSync(`${path}.restore-tmp`)).toBe(false);
        expect(existsSync(`${path}.pre-restore`)).toBe(false);
      }
      expect(existsSync(`${db}.bak`)).toBe(false);
    } finally {
      dropInstallation(install, previous);
    }
  });

  it("devuelve a su contenido anterior lo ya aplicado cuando falla un rename", async () => {
    // The failure can also land after some files are already swapped in: a
    // destination that cannot be replaced at that moment. What was applied has to
    // come back, newest first, or the installation stays half of each.
    const previous = { dir: process.env["OPENEXPERT_DATA_DIR"], cwd: process.cwd() };
    const install = await installCurrent();
    const bundleDb = install.dbBlob;
    renameControl.failWhenSourceEndsWith = "credentials.json.restore-tmp";
    try {
      const db = join(install.data, "openexpert.db");
      const config = join(install.cwd, "openexpert.json");
      const secrets = join(install.data, "secrets.json");
      const credentials = join(install.data, "credentials.json");
      writeFileSync(credentials, JSON.stringify({ token: "viejo" }));
      const before = {
        db: readFileSync(db),
        config: readFileSync(config),
        secrets: readFileSync(secrets),
        credentials: readFileSync(credentials),
      };

      const error = await rejectionOf(
        restoreBackup(
          bundleOf({
            db: Buffer.from(bundleDb, "base64"),
            config: JSON.stringify({ modelProvider: "openai", modelId: "nuevo" }),
            secrets: JSON.stringify({ CLAVE: "nueva" }),
            credentials: JSON.stringify({ token: "nuevo" }),
          }),
        ),
      );

      expect(readFileSync(db).equals(before.db)).toBe(true);
      expect(readFileSync(config).equals(before.config)).toBe(true);
      expect(readFileSync(secrets).equals(before.secrets)).toBe(true);
      expect(readFileSync(credentials).equals(before.credentials)).toBe(true);
      // The previous content is back in place, not only in a copy next to it.
      expect(JSON.parse(readFileSync(config, "utf8"))).toEqual({
        modelProvider: "ollama",
        modelId: "viejo",
      });
      expect(error.message).toMatch(/No se pudo aplicar la copia \(EISDIR/);
      // config and secrets are swapped in before the failure, so both go back, and
      // the message says which ones instead of talking about the database alone.
      expect(error.message).toMatch(/Se ha deshecho el cambio en secrets, config\./);
      expect(error.message).toMatch(/La instalación está como estaba\./);
      expect(error.message).not.toMatch(/La base de datos anterior se ha restaurado/);
      for (const path of [config, secrets, credentials]) {
        expect(existsSync(`${path}.pre-restore`)).toBe(false);
        expect(existsSync(`${path}.restore-tmp`)).toBe(false);
      }
    } finally {
      renameControl.failWhenSourceEndsWith = null;
      dropInstallation(install, previous);
    }
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
