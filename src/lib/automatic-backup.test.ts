// SPDX-License-Identifier: MIT
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { decryptBackup, isEncryptedBackup } from "./backup-crypto";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-auto-backup-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});
afterAll(() => {
  delete process.env["OPENEXPERT_DATA_DIR"];
  rmSync(dir, { recursive: true, force: true });
});

it("creates one encrypted, recoverable local backup under concurrent checks and keeps existing backups", async () => {
  const auto = await import("./automatic-backup.server");
  const db = await import("./db.server");
  const backup = await import("./backup.server");
  await db.getDb();
  writeFileSync(join(dir, "secrets.json"), '{"test":"private-value"}', { mode: 0o600 });
  expect(await auto.checkAutomaticBackup()).toEqual({ created: false });
  auto.startAutomaticBackup("correct horse battery");
  const results = await Promise.all([auto.checkAutomaticBackup(), auto.checkAutomaticBackup()]);
  expect(results.every((r) => r.created)).toBe(true);
  const folder = join(dir, "automatic-backups");
  const names = readdirSync(folder);
  expect(names).toHaveLength(1);
  const path = join(folder, names[0]!);
  const encrypted = readFileSync(path, "utf8");
  expect(isEncryptedBackup(encrypted)).toBe(true);
  expect(encrypted).not.toContain("private-value");
  expect(statSync(path).mode & 0o777).toBe(0o600);
  const decoded = decryptBackup(encrypted, "correct horse battery");
  expect((await backup.inspectBackup(decoded)).included).toContain("db");
  expect((JSON.parse(decoded) as { files: Record<string, string> }).files["secrets"]).toBeDefined();
  auto.startAutomaticBackup("another password");
  expect(await auto.checkAutomaticBackup()).toEqual({ created: false });
  expect(readFileSync(path, "utf8")).toBe(encrypted);
  auto.stopAutomaticBackup();
  expect(auto.automaticBackupStatus().active).toBe(false);
});

it("cancels a pending check when disabled and exposes a filesystem failure", async () => {
  const { vi } = await import("vitest");
  const auto = await import("./automatic-backup.server");
  const existing = readdirSync(join(dir, "automatic-backups"));
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2030-02-02T12:00:00"));
    auto.startAutomaticBackup("correct horse battery");
    const pending = auto.checkAutomaticBackup();
    auto.stopAutomaticBackup();
    expect(await pending).toEqual({ created: false });
    expect(readdirSync(join(dir, "automatic-backups"))).toEqual(existing);
    rmSync(join(dir, "automatic-backups"), { recursive: true });
    writeFileSync(join(dir, "automatic-backups"), "not a directory");
    auto.startAutomaticBackup("correct horse battery");
    await expect(auto.checkAutomaticBackup()).rejects.toThrow();
    expect(auto.automaticBackupStatus().lastError).toMatch(/No se pudo/);
    auto.stopAutomaticBackup();
  } finally {
    vi.useRealTimers();
  }
});
