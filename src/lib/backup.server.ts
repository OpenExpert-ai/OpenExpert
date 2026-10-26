// SPDX-License-Identifier: MIT
// Backup, restore and data maintenance for the local edition.
//
// A backup is a single JSON document holding the SQLite database plus every
// file the install keeps outside it (configuration, secrets, and the encrypted
// credential custody: tokens, Picker grants, local folders, Notion, consent and
// the key that decrypts them), all base64-encoded so the bundle stays portable
// and self-contained. The key travels with the blobs on purpose: without it a
// restored credentials.json is ciphertext nobody can read, which is the same as
// losing the integration. That also makes the bundle as sensitive as the tokens
// it carries, and the panel says so.

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Database } from "sql.js";
import { z } from "zod";
import { applyFileConfigToEnv, checkFileConfig, setRuntimeEnv } from "./config.server";
import {
  assertKnownSchema,
  getDb,
  loadSqlJs,
  persist,
  resetDbHandle,
  SchemaTooNewError,
  schemaVersionOf,
} from "./db.server";
import { configPath, credentialsPath, dataDir, dbPath, secretsPath } from "./paths.server";
import * as schema from "../../drizzle/schema";

export const BACKUP_FORMAT = "openexpert-backup";
/** 2 adds the local key and the integration state (grants, folders, Notion, consent). */
export const BACKUP_VERSION = 2;

/**
 * Every file the envelope can carry. The order is the one the panel and the
 * activity log list them in, so the database comes first.
 */
const BACKUP_FILES = [
  "db",
  "config",
  "secrets",
  "credentials",
  "secretKey",
  "driveGrants",
  "localRoots",
  "notion",
  "driveConsent",
] as const;

export type LogicalFile = (typeof BACKUP_FILES)[number];

/** Credential custody: encrypted with the local key, mode 0600 on disk. */
const ENCRYPTED_FILES: LogicalFile[] = [
  "credentials",
  "driveGrants",
  "localRoots",
  "notion",
  "driveConsent",
];

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
    case "secretKey":
      return join(dataDir(), "secret.key");
    case "driveGrants":
      return join(dataDir(), "drive-grants.json");
    case "localRoots":
      return join(dataDir(), "local-roots.json");
    case "notion":
      return join(dataDir(), "notion.json");
    case "driveConsent":
      return join(dataDir(), "drive-consent.json");
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
  for (const key of BACKUP_FILES) {
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
  // This is the bundle's *format* version, not the database schema's: a newer
  // envelope may mean things this build cannot honour, so it is refused instead
  // of being applied halfway. The schema the database inside claims is checked
  // in `assertValidDatabase`, which knows the last migration this build ships.
  version: z.number().int().min(1).max(BACKUP_VERSION),
  files: z.record(z.string(), z.string()),
});

const SQLITE_HEADER = "SQLite format 3\u0000";

/**
 * Whether the bundled configuration is one the application can run with.
 *
 * The bundle is a file that arrives from outside, and `openexpert.json` has a
 * schema in the repository: `fileConfigSchema`, the same one the settings panel
 * and the raw editor go through, which caps `chat.maxSteps` at 200 steps (each
 * step is a billable provider call), `chat.retentionDays` at 3650 days and
 * `ai.maxOutputTokens` at 200000 tokens, and refuses an injection pattern that
 * can freeze the server. The restore used to write the file as it came, which
 * left those doors open for whoever made the bundle.
 *
 * The check is here, at the door, and not in whoever builds the bundle: the
 * bundle may come from another machine, from an old version or from nowhere.
 */
function assertValidConfig(b64: string | undefined): void {
  if (b64 === undefined) return;
  const text = Buffer.from(b64, "base64").toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (e) {
    throw new Error(
      `La copia trae un openexpert.json que no es JSON válido (${e instanceof Error ? e.message : String(e)}). No se ha cambiado nada.`,
      { cause: e },
    );
  }
  const check = checkFileConfig(parsed);
  if (!check.ok) {
    throw new Error(
      `La copia trae un openexpert.json que la aplicación no puede usar: ${check.problems.join(" ")}. No se ha cambiado nada.`,
    );
  }
}

/**
 * Whether the bundled bytes are a database sql.js can actually open, and one
 * this build understands. A restored file that does not open is a database the
 * app cannot start with, so this has to be answered before the real one is
 * replaced — the header alone is not enough (a truncated file keeps its first
 * 16 bytes). The schema version matters for the same reason: a bundle from a
 * newer build carries tables this one has never read, and its migrations would
 * be skipped as already applied.
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
    // A bundle from a newer build carries a schema this one has never read, so
    // its migrations would be skipped as already applied. It is not a broken
    // file: it is one this build cannot use, and its message says so.
    assertKnownSchema(schemaVersionOf(db));
  } catch (e) {
    if (e instanceof SchemaTooNewError) throw e;
    throw invalid(e instanceof Error ? e.message : String(e));
  } finally {
    db?.close();
  }
}

export type RestoreResult = {
  applied: LogicalFile[];
  /**
   * Files this version can restore that the bundle did not bring, and whose
   * absence changes what the installation can do: the local key when there are
   * encrypted blobs to decrypt, and — for version 1 bundles — the key and the
   * integration state, which that format never carried.
   */
  missing: LogicalFile[];
  /** Copy of the previous database, kept so the restore can be undone. */
  backupPath: string | null;
};

/**
 * What a restore will be short of.
 *
 * From version 2 on `buildBackup` includes every data-dir file that exists, so
 * an absent one means "not configured at the origin" and is not news. A version
 * 1 bundle never carried the key or the integration state, so those absences are
 * a known hole worth reporting: the credentials it does carry come back as
 * ciphertext and every integration shows as disconnected. The key is also
 * reported whenever the bundle brings encrypted blobs without it, whatever the
 * version says.
 */
function missingAfterRestore(
  version: number,
  files: Partial<Record<LogicalFile, string>>,
): LogicalFile[] {
  const missing: LogicalFile[] = [];
  const extras: LogicalFile[] = [
    "secretKey",
    "driveGrants",
    "localRoots",
    "notion",
    "driveConsent",
  ];
  if (version < 2) missing.push(...extras.filter((k) => files[k] === undefined));
  if (files["secretKey"] === undefined && ENCRYPTED_FILES.some((k) => files[k] !== undefined)) {
    missing.push("secretKey");
  }
  return missing;
}

/**
 * The envelope carries the key and the blobs it decrypts, so everything it
 * writes back — the database aside — is owner-only, exactly as the app leaves
 * it on disk.
 */
function modeFor(key: LogicalFile): number | undefined {
  return key === "db" || key === "config" ? undefined : 0o600;
}

/**
 * Where the content a file is about to lose waits while the swap runs. The
 * database keeps the `.bak` name the panel has always advertised; the rest use
 * `.pre-restore` and are dropped once the swap ends.
 */
function keepPathFor(key: LogicalFile, path: string): string {
  return key === "db" ? `${path}.bak` : `${path}.pre-restore`;
}

type StagedFile = {
  key: LogicalFile;
  path: string;
  tmp: string;
  keep: string;
  /** The target was already there, so there is an earlier content to put back. */
  existed: boolean;
};

/**
 * Cheap files first, the database last: its rename is the only one that makes
 * the installation unreadable on its own, so it happens once the rest is in.
 */
function swapOrder(staged: StagedFile[]): StagedFile[] {
  return [...staged].sort((a, b) => Number(a.key === "db") - Number(b.key === "db"));
}

/**
 * What a failed swap says: which files went back to their previous content,
 * which ones could not (and where that content still is), and that nothing
 * else was touched. A message that only mentions the database is what made the
 * half-applied installation invisible.
 */
function swapFailureMessage(detail: string, undone: LogicalFile[], stuck: StagedFile[]): string {
  const parts = [`No se pudo aplicar la copia (${detail}).`];
  if (undone.length) parts.push(`Se ha deshecho el cambio en ${undone.join(", ")}.`);
  if (stuck.length) {
    parts.push(
      `No se ha podido devolver ${stuck.map((s) => s.key).join(", ")}; ` +
        `su contenido anterior sigue en ${stuck.map((s) => s.keep).join(", ")}.`,
    );
  }
  parts.push(
    stuck.length
      ? "El resto de la instalación está como estaba."
      : undone.length
        ? "La instalación está como estaba."
        : "No se ha cambiado nada.",
  );
  return parts.join(" ");
}

/**
 * Restore a bundle, overwriting the database and canonical files.
 *
 * All or nothing: the database in the bundle is opened in memory first, every
 * file is staged next to its destination, and the content each swap is about to
 * replace is kept aside before anything is touched. The renames go cheap files
 * first and the database last; if one of them fails, the ones already swapped go
 * back to their previous content in reverse order. A bundle that fails halfway
 * leaves the installation as it was — it used to leave yesterday's database next
 * to the bundle's configuration and secrets, with a message that only mentioned
 * the database.
 */
export async function restoreBackup(content: string): Promise<RestoreResult> {
  const parsed = restoreSchema.parse(JSON.parse(content) as unknown);
  const dbB64 = parsed.files["db"];
  if (dbB64 !== undefined) await assertValidDatabase(Buffer.from(dbB64, "base64"));
  // The configuration is checked before anything is staged: a bundle whose
  // `openexpert.json` the application cannot use is refused whole, and the
  // installation keeps the file it had.
  assertValidConfig(parsed.files["config"]);

  mkdirSync(dataDir(), { recursive: true });

  // 1. Stage every file beside its target; nothing real is touched yet.
  const staged: StagedFile[] = [];
  try {
    for (const key of BACKUP_FILES) {
      const b64 = parsed.files[key];
      if (b64 === undefined) continue;
      const path = fileFor(key);
      const mode = modeFor(key);
      const tmp = `${path}.restore-tmp`;
      writeFileSync(tmp, Buffer.from(b64, "base64"), mode ? { mode } : undefined);
      staged.push({ key, path, tmp, keep: keepPathFor(key, path), existed: false });
    }
  } catch (e) {
    for (const s of staged) rmSync(s.tmp, { force: true });
    throw new Error(
      `No se pudo escribir la copia en ${dataDir()}: ${e instanceof Error ? e.message : String(e)}. No se ha cambiado nada.`,
      { cause: e },
    );
  }

  // 2. Keep what every swap is going to replace, so each file can be put back on
  //    its own if a later rename fails. The database copy keeps its `<db>.bak`
  //    name, which is the one the panel points at.
  let backupPath: string | null = null;
  let current: StagedFile | undefined;
  try {
    for (const s of staged) {
      current = s;
      if (!existsSync(s.path)) continue;
      const mode = modeFor(s.key);
      copyFileSync(s.path, s.keep);
      // copyFile does not carry the owner-only mode of the credentials, and this
      // copy is what a rollback renames back into place.
      if (mode) chmodSync(s.keep, mode);
      s.existed = true;
      if (s.key === "db") backupPath = s.keep;
    }
  } catch (e) {
    for (const s of staged) {
      rmSync(s.tmp, { force: true });
      if (s.existed) rmSync(s.keep, { force: true });
    }
    const where = current ? ` de ${current.path} en ${current.keep}` : "";
    throw new Error(
      `No se pudo conservar el contenido actual${where}: ${e instanceof Error ? e.message : String(e)}. No se ha cambiado nada.`,
      { cause: e },
    );
  }

  // 3. Swap them in, the database last: its rename is the one that leaves an
  //    installation that cannot start with what came before, so it only happens
  //    once every other file is in place.
  const swapped: StagedFile[] = [];
  try {
    for (const s of swapOrder(staged)) {
      renameSync(s.tmp, s.path);
      swapped.push(s);
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    for (const s of staged) rmSync(s.tmp, { force: true });
    // Put back everything already swapped, newest first, so the files of the
    // bundle do not survive next to the ones of the installation.
    const undone: LogicalFile[] = [];
    const stuck: StagedFile[] = [];
    for (const s of [...swapped].reverse()) {
      try {
        if (s.existed) renameSync(s.keep, s.path);
        else rmSync(s.path, { force: true });
        undone.push(s.key);
      } catch {
        // Nothing else to try: the message names the copy that still holds it.
        stuck.push(s);
      }
    }
    // The copies of the files that were never swapped are just copies of what is
    // still in place; only the stuck ones have to stay, and the database keeps its
    // `.bak` like every other failure does.
    const kept = new Set([...swapped, ...stuck].map((s) => s.key));
    for (const s of staged) {
      if (s.key === "db" || !s.existed || kept.has(s.key)) continue;
      try {
        rmSync(s.keep, { force: true });
      } catch {
        // Harmless: it is the same content as the file that never moved.
      }
    }
    resetDbHandle();
    throw new Error(swapFailureMessage(detail, undone, stuck), { cause: e });
  }

  // The swap ended well: the copies it needed are worthless now. The database
  // one stays, because that is the manual way back the panel announces.
  for (const s of staged) {
    if (s.key === "db" || !s.existed) continue;
    try {
      rmSync(s.keep, { force: true });
    } catch {
      // A leftover copy does not make the restore any less done.
    }
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

  return {
    applied: swapped.map((s) => s.key),
    missing: missingAfterRestore(parsed.version, parsed.files),
    backupPath,
  };
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
