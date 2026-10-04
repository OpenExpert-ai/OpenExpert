// SPDX-License-Identifier: MIT
// Backup, restore and data maintenance for the local edition.
//
// A backup is a single JSON document holding the SQLite database plus the
// canonical files (openexpert.json, secrets.json, credentials.json), all
// base64-encoded so the bundle stays portable and self-contained.

import {
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
import { getDb, persist, resetDbHandle } from "./db.server";
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

/** Restore a bundle, overwriting the database and canonical files. */
export function restoreBackup(content: string): { applied: LogicalFile[] } {
  const parsed = restoreSchema.parse(JSON.parse(content) as unknown);
  mkdirSync(dataDir(), { recursive: true });
  const applied: LogicalFile[] = [];

  for (const key of ["db", "config", "secrets", "credentials"] as LogicalFile[]) {
    const b64 = parsed.files[key];
    if (b64 === undefined) continue;
    const path = fileFor(key);
    const buf = Buffer.from(b64, "base64");
    const mode = key === "secrets" || key === "credentials" ? 0o600 : undefined;
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, buf, mode ? { mode } : undefined);
    renameSync(tmp, path);
    applied.push(key);
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

  return { applied };
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
    processes: count(raw, "processes"),
    integrations: count(raw, "integrations"),
    activity: count(raw, "activity"),
    chatMessages: count(raw, "chat_messages"),
    backupsSupported: true,
  };
}
