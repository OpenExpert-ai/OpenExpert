// SPDX-License-Identifier: MIT
// Server-side local file storage (~/.openexpert/*.json by default).
// In cloud mode, Supabase is used instead; this file backs the local
// edition only.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type LocalTable = "activity" | "chat_messages" | "experts" | "processes";

function dataDir(): string {
  const raw = process.env["OPENEXPERT_DATA_DIR"] || "~/.openexpert";
  const home = process.env["HOME"] || process.env["USERPROFILE"] || ".";
  const dir = raw.startsWith("~/") ? join(home, raw.slice(2)) : raw;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function fileFor(table: LocalTable): string {
  return join(dataDir(), `${table}.json`);
}

export function readLocalTable(table: LocalTable): Record<string, unknown>[] {
  const f = fileFor(table);
  if (!existsSync(f)) return [];
  try {
    const v = JSON.parse(readFileSync(f, "utf8")) as unknown;
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

export function appendLocalRows(table: LocalTable, rows: Record<string, unknown>[]): void {
  const cur = readLocalTable(table);
  writeFileSync(fileFor(table), JSON.stringify([...cur, ...rows], null, 2));
}
