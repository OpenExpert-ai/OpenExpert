// SPDX-License-Identifier: MIT
// Headless entry point for the scheduled tasks: `node .output/jobs/index.mjs
// run`. It owns the data directory for the few seconds the run lasts, so it
// never runs while a window is open. Built by `vite.jobs.config.ts`.
import { DataDirectoryBusyError, isDataDirectoryBusy } from "../lib/data-lock.server";
import { runDueJobs, scheduledBackupPassphrase } from "../lib/jobs.server";
import { dataDir } from "../lib/paths.server";

const COMMANDS = new Set(["run", "status"]);

function usage(): void {
  console.error("Uso: node .output/jobs/index.mjs <run|status>");
}

async function run(): Promise<number> {
  try {
    const result = await runDueJobs();
    const report = result.report ? "informe diario escrito" : "informe diario sin cambios";
    const backup =
      result.backup === "created"
        ? "copia cifrada creada"
        : result.backup === "existing"
          ? "copia de hoy ya existente"
          : "copia omitida: no hay contraseña guardada";
    console.log(`OpenExpert: ${report}; ${backup}.`);
    return 0;
  } catch (error) {
    if (error instanceof DataDirectoryBusyError) {
      console.error(error.message);
      return 2;
    }
    console.error(
      `OpenExpert: la tarea programada falló (${error instanceof Error ? error.message : String(error)}).`,
    );
    return 1;
  }
}

function status(): number {
  const busy = isDataDirectoryBusy(dataDir());
  const passphrase = scheduledBackupPassphrase() ? "configurada" : "sin configurar";
  console.log(`Directorio de datos: ${dataDir()}`);
  console.log(`Uso por otra instancia: ${busy ? "sí" : "no"}`);
  console.log(`Contraseña de copia: ${passphrase}`);
  return 0;
}

const command = process.argv[2] ?? "run";
if (!COMMANDS.has(command)) {
  usage();
  process.exit(2);
}
process.exit(command === "status" ? status() : await run());
