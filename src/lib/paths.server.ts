// SPDX-License-Identifier: MIT
// Filesystem paths for the local edition. Kept dependency-free so both the
// database bootstrap and the configuration layer can import it without cycles.

import { join } from "node:path";

/** Expand a leading `~` to the user's home directory. */
export function expandHome(p: string): string {
  if (p === "~") return process.env["HOME"] || process.env["USERPROFILE"] || ".";
  if (p.startsWith("~/"))
    return join(process.env["HOME"] || process.env["USERPROFILE"] || ".", p.slice(2));
  return p;
}

/** Directory holding the SQLite database and credentials (default ~/.openexpert). */
export function dataDir(): string {
  const raw = process.env["OPENEXPERT_DATA_DIR"] || "~/.openexpert";
  return expandHome(raw);
}

export function dbPath(): string {
  return join(dataDir(), "openexpert.db");
}

/** Canonical configuration file (CLI and app share it). */
export function configPath(cwd: string = process.cwd()): string {
  return join(cwd, "openexpert.json");
}

/** Secrets written by the CLI wizard and the settings panel (mode 0600). */
export function secretsPath(): string {
  return join(dataDir(), "secrets.json");
}

/** Google Drive OAuth tokens for the single owner (mode 0600). */
export function credentialsPath(): string {
  return join(dataDir(), "credentials.json");
}
