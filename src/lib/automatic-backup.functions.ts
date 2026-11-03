// SPDX-License-Identifier: MIT
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getAutomaticBackup = createServerFn({ method: "GET" }).handler(async () => {
  const backup = await import("./automatic-backup.server");
  return backup.automaticBackupStatus();
});
export const enableAutomaticBackup = createServerFn({ method: "POST" })
  .validator((value) => z.object({ passphrase: z.string().min(8).max(200) }).parse(value))
  .handler(async ({ data }) => {
    const backup = await import("./automatic-backup.server");
    backup.startAutomaticBackup(data.passphrase);
    await backup.checkAutomaticBackup();
    return backup.automaticBackupStatus();
  });
export const disableAutomaticBackup = createServerFn({ method: "POST" }).handler(async () => {
  const backup = await import("./automatic-backup.server");
  backup.stopAutomaticBackup();
  return backup.automaticBackupStatus();
});
export const runAutomaticBackup = createServerFn({ method: "POST" }).handler(async () => {
  const backup = await import("./automatic-backup.server");
  return backup.checkAutomaticBackup();
});
