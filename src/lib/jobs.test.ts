// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-jobs-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});
afterAll(() => {
  delete process.env["OPENEXPERT_DATA_DIR"];
  delete process.env["OPENEXPERT_BACKUP_PASSPHRASE"];
  rmSync(dir, { recursive: true, force: true });
});

it("runs the report and the encrypted backup once, then reports a no-op", async () => {
  const { getDb } = await import("./db.server");
  const { raw } = await getDb();
  raw.run(
    "INSERT INTO invoices (id,client,amount,due_date,status,reminders) VALUES ('job-one','Demo',50,'2000-01-01','open',0)",
  );
  const { runDueJobs, scheduledBackupPassphrase } = await import("./jobs.server");

  expect(await runDueJobs()).toEqual({ report: false, backup: "no-passphrase" });

  raw.run(
    "INSERT INTO settings (key,value,updated_at) VALUES ('daily-overdue-report','true',0) ON CONFLICT(key) DO UPDATE SET value='true'",
  );
  writeFileSync(join(dir, "secrets.json"), JSON.stringify({ BACKUP_PASSPHRASE: "frase-larga" }));
  expect(scheduledBackupPassphrase()).toBe("frase-larga");

  expect(await runDueJobs()).toEqual({ report: true, backup: "created" });
  expect(await runDueJobs()).toEqual({ report: false, backup: "existing" });

  const reports =
    raw.exec("SELECT id FROM activity WHERE id LIKE 'daily-overdue-report-%'")[0]?.values ?? [];
  expect(reports).toHaveLength(1);
  const day = new Date();
  const name = `openexpert-${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}.json.enc`;
  expect(existsSync(join(dir, "automatic-backups", name))).toBe(true);
});

it("prefers the environment passphrase and ignores short values", async () => {
  const { scheduledBackupPassphrase } = await import("./jobs.server");
  writeFileSync(join(dir, "secrets.json"), JSON.stringify({ BACKUP_PASSPHRASE: "corta" }));
  expect(scheduledBackupPassphrase()).toBeNull();
  expect(scheduledBackupPassphrase({ OPENEXPERT_BACKUP_PASSPHRASE: "desde-entorno" })).toBe(
    "desde-entorno",
  );
});
