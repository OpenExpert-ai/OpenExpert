// SPDX-License-Identifier: MIT
// Backup, restore and data maintenance for the local edition.
//
// A backup is a single JSON document holding the SQLite database plus the
// canonical files (openexpert.json, secrets.json, credentials.json), all
// base64-encoded so the bundle stays portable and self-contained.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type { Database } from "sql.js";
import { z } from "zod";
import { applyFileConfigToEnv, setRuntimeEnv } from "./config.server";
import { getDb, loadSqlJs, persist, resetDbHandle } from "./db.server";
import { configPath, credentialsPath, dataDir, dbPath, secretsPath } from "./paths.server";
import * as schema from "../../drizzle/schema";

export const BACKUP_FORMAT = "openexpert-backup";
export const BACKUP_VERSION = 1;

type LogicalFile = "db" | "config" | "secrets" | "credentials";

function fileFor(key: LogicalFile): string {
  switch (key) {
    case "db":
      return dbPath();
    case "config":
      return configPath();
    case "secrets":
      return secretsPath();
    case "credentials":
      return credentialsPath();
  }
}

export type BackupBundle = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  files: Partial<Record<LogicalFile, string>>;
};

export function buildBackup(): BackupBundle {
  const files: Partial<Record<LogicalFile, string>> = {};
  for (const key of ["db", "config", "secrets", "credentials"] as LogicalFile[]) {
    const path = fileFor(key);
    if (existsSync(path)) files[key] = readFileSync(path).toString("base64");
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    files,
  };
}

const restoreSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1),
  files: z.record(z.string(), z.string()),
});

const SQLITE_HEADER = "SQLite format 3\u0000";

/**
 * Whether the bundled bytes are a database sql.js can actually open. A restored
 * file that does not open is a database the app cannot start with, so this has
 * to be answered before the real one is replaced — the header alone is not enough
 * (a truncated file keeps its first 16 bytes).
 */
async function assertValidDatabase(buf: Buffer): Promise<void> {
  const invalid = (detail?: string) =>
    new Error(
      `La copia no contiene una base de datos válida${detail ? ` (${detail})` : ""}. No se ha cambiado nada.`,
    );
  if (buf.length < 100 || buf.subarray(0, 16).toString("latin1") !== SQLITE_HEADER) throw invalid();
  const SQL = await loadSqlJs();
  let db: Database | null = null;
  try {
    db = new SQL.Database(buf);
    // Opening is lazy; touching the schema is what reads the file and throws.
    db.exec("PRAGMA schema_version");
  } catch (e) {
    throw invalid(e instanceof Error ? e.message : String(e));
  } finally {
    db?.close();
  }
}

export type RestoreResult = {
  applied: LogicalFile[];
  /** Copy of the previous database, kept so the restore can be undone. */
  backupPath: string | null;
};

/**
 * Restore a bundle, overwriting the database and canonical files.
 *
 * All or nothing: the database in the bundle is opened in memory first, every
 * file is staged next to its destination and only renamed once they all staged
 * successfully, and the previous database is copied to `<db>.bak` before it is
 * replaced. A bundle that fails any of those checks leaves the installation
 * exactly as it was.
 */
export async function restoreBackup(content: string): Promise<RestoreResult> {
  const parsed = restoreSchema.parse(JSON.parse(content) as unknown);
  const dbB64 = parsed.files["db"];
  if (dbB64 !== undefined) await assertValidDatabase(Buffer.from(dbB64, "base64"));

  mkdirSync(dataDir(), { recursive: true });

  // 1. Stage every file beside its target; nothing real is touched yet.
  const staged: { key: LogicalFile; path: string; tmp: string }[] = [];
  try {
    for (const key of ["db", "config", "secrets", "credentials"] as LogicalFile[]) {
      const b64 = parsed.files[key];
      if (b64 === undefined) continue;
      const path = fileFor(key);
      const mode = key === "secrets" || key === "credentials" ? 0o600 : undefined;
      const tmp = `${path}.restore-tmp`;
      writeFileSync(tmp, Buffer.from(b64, "base64"), mode ? { mode } : undefined);
      staged.push({ key, path, tmp });
    }
  } catch (e) {
    for (const s of staged) rmSync(s.tmp, { force: true });
    throw new Error(
      `No se pudo escribir la copia en ${dataDir()}: ${e instanceof Error ? e.message : String(e)}. No se ha cambiado nada.`,
      { cause: e },
    );
  }

  // 2. Keep the current database, so a failed swap can be undone.
  const currentDb = dbPath();
  let backupPath: string | null = null;
  if (staged.some((s) => s.key === "db") && existsSync(currentDb)) {
    backupPath = `${currentDb}.bak`;
    try {
      copyFileSync(currentDb, backupPath);
    } catch (e) {
      for (const s of staged) rmSync(s.tmp, { force: true });
      throw new Error(
        `No se pudo conservar la base de datos actual en ${backupPath}: ${e instanceof Error ? e.message : String(e)}. No se ha cambiado nada.`,
        { cause: e },
      );
    }
  }

  // 3. Swap them in; if any rename fails, put the previous database back.
  const applied: LogicalFile[] = [];
  try {
    for (const s of staged) {
      renameSync(s.tmp, s.path);
      applied.push(s.key);
    }
  } catch (e) {
    for (const s of staged) rmSync(s.tmp, { force: true });
    if (backupPath && existsSync(backupPath)) {
      try {
        copyFileSync(backupPath, currentDb);
      } catch {
        // Nothing else to try: the message below names the copy that holds the data.
      }
    }
    resetDbHandle();
    throw new Error(
      `No se pudo aplicar la copia (${e instanceof Error ? e.message : String(e)}). ` +
        (backupPath
          ? `La base de datos anterior se ha restaurado desde ${backupPath}.`
          : "La base de datos anterior no se ha tocado."),
      { cause: e },
    );
  }

  // Drop the in-memory database so the next read loads the restored file.
  resetDbHandle();

  // Re-apply the environment bridge from the restored files.
  applyFileConfigToEnv();
  if (parsed.files["secrets"]) {
    try {
      const secrets = JSON.parse(
        Buffer.from(parsed.files["secrets"], "base64").toString("utf8"),
      ) as Record<string, string>;
      for (const [k, v] of Object.entries(secrets)) if (typeof v === "string") setRuntimeEnv(k, v);
    } catch {
      // A malformed secrets file must not abort the restore.
    }
  }

  return { applied, backupPath };
}

/* ---------------------------- maintenance ------------------------------- */

export async function clearChatHistory(): Promise<number> {
  const { orm, raw } = await getDb();
  const before = count(raw, "chat_messages");
  orm.delete(schema.chatMessages).run();
  await persist();
  return before;
}

export async function vacuumDb(): Promise<void> {
  const { raw } = await getDb();
  raw.run("VACUUM");
  await persist();
}

/** Delete the database file and let the next read recreate and re-seed it. */
export async function resetData(): Promise<void> {
  resetDbHandle();
  const path = dbPath();
  if (existsSync(path)) rmSync(path);
  await getDb();
  await persist();
}

function count(raw: Database, table: string): number {
  const res = raw.exec(`SELECT COUNT(*) FROM ${table}`);
  const value = res[0]?.values[0]?.[0];
  return typeof value === "number" ? value : 0;
}

export async function dataStats() {
  const { raw } = await getDb();
  const db = dbPath();
  let dbSize = 0;
  try {
    if (existsSync(db)) dbSize = statSync(db).size;
  } catch {
    dbSize = 0;
  }
  return {
    dbSize,
    experts: count(raw, "experts"),
    integrations: count(raw, "integrations"),
    activity: count(raw, "activity"),
    chatMessages: count(raw, "chat_messages"),
    backupsSupported: true,
  };
}
