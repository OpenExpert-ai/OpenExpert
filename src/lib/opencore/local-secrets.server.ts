// SPDX-License-Identifier: MIT
// Local credential custody: the Google Drive OAuth tokens for the single
// owner, stored in ~/.openexpert/credentials.json (mode 0600).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "@/lib/db.server";

export type LocalTokens = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
};

function credFile(): string {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  return join(dir, "credentials.json");
}

export function loadTokens(): LocalTokens | null {
  const f = credFile();
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8")) as LocalTokens;
  } catch {
    return null;
  }
}

export function saveTokens(t: LocalTokens): void {
  writeFileSync(credFile(), JSON.stringify(t, null, 2), { mode: 0o600 });
}

export function removeTokens(): void {
  const f = credFile();
  if (existsSync(f)) writeFileSync(f, JSON.stringify({}, null, 2), { mode: 0o600 });
}
