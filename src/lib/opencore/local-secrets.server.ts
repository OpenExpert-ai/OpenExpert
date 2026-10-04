// SPDX-License-Identifier: MIT
// Server-side local credentials store (Google Drive tokens in local mode).
// In cloud mode the `google_tokens` table is used; here we keep the same
// shape in a file at ~/.openexpert/credentials.json (mode 0600), which
// never leaves your machine.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type LocalTokens = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
};

function credFile(): string {
  const raw = process.env["OPENEXPERT_DATA_DIR"] || "~/.openexpert";
  const home = process.env["HOME"] || process.env["USERPROFILE"] || ".";
  const dir = raw.startsWith("~/") ? join(home, raw.slice(2)) : raw;
  mkdirSync(dir, { recursive: true });
  return join(dir, "credentials.json");
}

type Store = Record<string, LocalTokens>;

function readAll(): Store {
  const f = credFile();
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, "utf8")) as Store;
  } catch {
    return {};
  }
}

export function loadLocalTokens(userId: string): LocalTokens | null {
  return readAll()[userId] ?? null;
}

export function saveLocalTokens(userId: string, t: LocalTokens): void {
  const all = readAll();
  all[userId] = t;
  writeFileSync(credFile(), JSON.stringify(all, null, 2), { mode: 0o600 });
}

export function removeLocalTokens(userId: string): void {
  const all = readAll();
  delete all[userId];
  writeFileSync(credFile(), JSON.stringify(all, null, 2), { mode: 0o600 });
}
