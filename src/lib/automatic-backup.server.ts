// SPDX-License-Identifier: MIT
// The passphrase lives only in this server process. The browser calls check
// while a window is open; this is not a background service.
import { existsSync, linkSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { buildBackup } from "./backup.server";
import { encryptBackup } from "./backup-crypto";
import { dataDir } from "./paths.server";
import { getDb, persist } from "./db.server";

let passphrase: string | null = null;
let pending: Promise<{ created: boolean }> | null = null;
let lastError: string | null = null;

export function automaticBackupStatus() {
  return {
    active: passphrase !== null,
    directory: join(dataDir(), "automatic-backups"),
    lastError,
  };
}

export function startAutomaticBackup(value: string) {
  if (value.length < 8 || value.length > 200)
    throw new Error("La contraseña debe tener entre 8 y 200 caracteres.");
  passphrase = value;
  lastError = null;
}

export function stopAutomaticBackup() {
  passphrase = null;
  lastError = null;
}

/** One local-day file, atomically published without replacing an existing copy. */
export function checkAutomaticBackup(): Promise<{ created: boolean }> {
  if (pending) return pending;
  const key = passphrase;
  if (!key) return Promise.resolve({ created: false });
  pending = (async () => {
    const date = new Date();
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dir = join(dataDir(), "automatic-backups");
    const dest = join(dir, `openexpert-${day}.json.enc`);
    if (existsSync(dest)) {
      lastError = null;
      return { created: false };
    }
    await getDb();
    await persist();
    // Stopping the schedule while persistence is in progress cancels the run.
    if (passphrase !== key) return { created: false };
    const encrypted = encryptBackup(JSON.stringify(buildBackup()), key);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const temp = join(dir, `.openexpert-${randomUUID()}.tmp`);
    try {
      writeFileSync(temp, encrypted, { flag: "wx", mode: 0o600 });
      try {
        linkSync(temp, dest);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          lastError = null;
          return { created: false };
        }
        throw error;
      }
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
    lastError = null;
    return { created: true };
  })()
    .catch((error: unknown) => {
      // Do not copy an error's text: paths or other details could contain secrets.
      lastError = "No se pudo crear la copia automática. Comprueba el espacio y los permisos.";
      throw error;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
