// SPDX-License-Identifier: MIT
// sql.js keeps the entire database in memory, so only one process may own a
// data directory at a time. A separate native SQLite connection holds an OS
// lock for the process lifetime; the database itself is never opened here.
import { chmodSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const REGISTRY = Symbol.for("openexpert.data-directory-locks.v1");
type Registry = Map<string, DatabaseSync>;
const globals = globalThis as typeof globalThis & { [REGISTRY]?: Registry };
const locks = (globals[REGISTRY] ??= new Map());

export class DataDirectoryBusyError extends Error {}

function isBusy(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "errcode" in error &&
    (error.errcode === 5 || error.errcode === 6)
  );
}

/** Hold an exclusive lock until this process exits, including across db reloads. */
export function acquireDataLock(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const canonical = realpathSync(directory);
  if (locks.has(canonical)) return;
  const lockFile = join(canonical, ".openexpert.lock.sqlite");
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(lockFile);
    if (process.platform !== "win32") chmodSync(lockFile, 0o600);
    // MEMORY keeps the lock file alone: no journal to leave behind on exit.
    db.exec("PRAGMA journal_mode = MEMORY; PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE;");
    locks.set(canonical, db);
  } catch (error) {
    try {
      db?.close();
    } catch {
      // Preserve the original error.
    }
    if (isBusy(error)) {
      throw new DataDirectoryBusyError(
        "Otra instancia de OpenExpert está usando este directorio de datos. Ciérrala y vuelve a intentarlo.",
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * Whether another process is using the directory, without keeping a lock of
 * our own. Used by `status`, which must answer while the app is open.
 */
export function isDataDirectoryBusy(directory: string): boolean {
  if (!existsSync(directory)) return false;
  const lockFile = join(realpathSync(directory), ".openexpert.lock.sqlite");
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(lockFile);
    db.exec("PRAGMA journal_mode = MEMORY; PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE; ROLLBACK;");
    return false;
  } catch (error) {
    if (isBusy(error)) return true;
    throw error;
  } finally {
    try {
      db?.close();
    } catch {
      // Nothing to do: the probe is over either way.
    }
  }
}
