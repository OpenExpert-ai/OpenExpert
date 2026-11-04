// SPDX-License-Identifier: MIT
// Scheduled work that does not need a window: the daily overdue report and the
// encrypted local backup. The caller must own the data directory (data-lock)
// and persist afterwards; both are done here so the HTTP server and the
// headless runner share one implementation.
import { readSecrets } from "./config.server";
import { BACKUP_PASSPHRASE_ENV, BACKUP_PASSPHRASE_SECRET } from "@openexpert/openexpert/config";
import { runDailyReportIfDue } from "./automation.server";
import {
  checkAutomaticBackup,
  startAutomaticBackup,
  stopAutomaticBackup,
} from "./automatic-backup.server";
import { getDb } from "./db.server";

/** Re-exported so the runner and its tests name the secret once. */
export { BACKUP_PASSPHRASE_ENV, BACKUP_PASSPHRASE_SECRET };

export type BackupOutcome = "created" | "existing" | "no-passphrase";

export type DueJobsResult = {
  report: boolean;
  backup: BackupOutcome;
};

/** Passphrase for an unattended backup: environment first, then the secrets file. */
export function scheduledBackupPassphrase(env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env[BACKUP_PASSPHRASE_ENV];
  if (fromEnv && fromEnv.length >= 8) return fromEnv;
  const stored = readSecrets()[BACKUP_PASSPHRASE_SECRET];
  return stored && stored.length >= 8 ? stored : null;
}

/**
 * Run everything that is due right now, once. Missing configuration is not an
 * error: a job that is off reports `off` instead of failing the whole run.
 */
export async function runDueJobs(): Promise<DueJobsResult> {
  await getDb();
  const report = (await runDailyReportIfDue()).ran;
  const passphrase = scheduledBackupPassphrase();
  let backup: BackupOutcome;
  if (passphrase) {
    startAutomaticBackup(passphrase);
    try {
      backup = (await checkAutomaticBackup()).created ? "created" : "existing";
    } finally {
      // The passphrase is only needed for this run; do not keep it around.
      stopAutomaticBackup();
    }
  } else {
    backup = "no-passphrase";
  }
  // Both jobs persist their own writes; rewriting an unchanged database every
  // fifteen minutes would only touch the file.
  return { report, backup };
}
