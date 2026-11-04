// SPDX-License-Identifier: MIT
// `openexpert jobs`: run the scheduled work without a window, and install the
// systemd user timer that does it while OpenExpert is closed. The runner keeps
// the data-directory lock, so a scheduled run never overlaps an open window.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  ensureStandaloneApp,
  findRepoRoot,
  packageVersion,
  readSecrets,
  run,
  writeSecrets,
} from "./lib.js";
import { BACKUP_PASSPHRASE_ENV, BACKUP_PASSPHRASE_SECRET } from "../config.js";

const UNIT_NAME = "openexpert-jobs";
const INTERVAL_MINUTES = 15;

function unitDir(): string {
  return join(homedir(), ".config", "systemd", "user");
}

/** Quote one systemd ExecStart argument. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export type UnitInput = {
  node: string;
  entry: string;
  workdir: string;
  dataDir?: string;
  intervalMinutes?: number;
};

/** The two unit files, as text: pure so the tests do not need systemd. */
export function unitFiles(input: UnitInput): { service: string; timer: string } {
  const interval = input.intervalMinutes ?? INTERVAL_MINUTES;
  const environment = input.dataDir ? `Environment="OPENEXPERT_DATA_DIR=${input.dataDir}"\n` : "";
  return {
    service: `[Unit]
Description=OpenExpert — tareas programadas

[Service]
Type=oneshot
WorkingDirectory=${input.workdir}
${environment}ExecStart=${quote(input.node)} ${quote(input.entry)} run
TimeoutStartSec=600
`,
    timer: `[Unit]
Description=OpenExpert — tareas programadas cada ${interval} minutos

[Timer]
OnCalendar=*:0/${interval}
RandomizedDelaySec=60
Persistent=true

[Install]
WantedBy=timers.target
`,
  };
}

/** Directory holding `.output/jobs/index.mjs`, or null with a reason printed. */
async function runnerDir(): Promise<string | null> {
  const repo = findRepoRoot(process.cwd());
  if (repo) {
    if (existsSync(join(repo, ".output", "jobs", "index.mjs"))) return repo;
    console.error("Falta el ejecutable de tareas: ejecuta `npm run build` en el repositorio.");
    return null;
  }
  const app = await ensureStandaloneApp(packageVersion(), { log: (m) => console.log(`  ${m}`) });
  if (app && existsSync(join(app, ".output", "jobs", "index.mjs"))) return app;
  console.error("No hay un servidor preconstruido con tareas programadas. Actualiza OpenExpert.");
  return null;
}

function systemctl(args: string[]): number {
  return spawnSync("systemctl", ["--user", ...args], { stdio: "inherit" }).status ?? 1;
}

function systemdAvailable(): boolean {
  const probe = spawnSync("systemctl", ["--user", "show-environment"], { stdio: "ignore" });
  return probe.status === 0;
}

async function runOnce(): Promise<number> {
  const dir = await runnerDir();
  if (!dir) return 1;
  return run(process.execPath, [join(dir, ".output", "jobs", "index.mjs"), "run"], {
    cwd: process.cwd(),
  });
}

async function install(): Promise<number> {
  if (process.platform !== "linux") {
    console.error("El programador usa systemd: solo está disponible en Linux.");
    return 1;
  }
  const dir = await runnerDir();
  if (!dir) return 1;
  const dataDir = process.env["OPENEXPERT_DATA_DIR"];
  const units = unitFiles({
    node: process.execPath,
    entry: join(dir, ".output", "jobs", "index.mjs"),
    workdir: process.cwd(),
    ...(dataDir ? { dataDir } : {}),
  });
  const target = unitDir();
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, `${UNIT_NAME}.service`), units.service, { mode: 0o644 });
  writeFileSync(join(target, `${UNIT_NAME}.timer`), units.timer, { mode: 0o644 });
  if (!systemdAvailable()) {
    console.error(
      `Unidades escritas en ${target}, pero systemd no responde en esta sesión.\n` +
        `Actívalas con: systemctl --user daemon-reload && systemctl --user enable --now ${UNIT_NAME}.timer`,
    );
    return 1;
  }
  systemctl(["daemon-reload"]);
  if (systemctl(["enable", "--now", `${UNIT_NAME}.timer`]) !== 0) {
    console.error(`No se pudo activar ${UNIT_NAME}.timer.`);
    return 1;
  }
  console.log(`✓ Tareas programadas cada ${INTERVAL_MINUTES} minutos (${UNIT_NAME}.timer).`);
  console.log(
    "  Solo corren con OpenExpert cerrado; si está abierto, la siguiente vuelve a probar.",
  );
  console.log("  Para que corran sin sesión iniciada: loginctl enable-linger $USER");
  return 0;
}

function uninstall(): number {
  if (systemdAvailable()) {
    systemctl(["disable", "--now", `${UNIT_NAME}.timer`]);
    systemctl(["daemon-reload"]);
  }
  for (const file of [`${UNIT_NAME}.service`, `${UNIT_NAME}.timer`]) {
    rmSync(join(unitDir(), file), { force: true });
  }
  console.log("✓ Tareas programadas desinstaladas.");
  return 0;
}

async function status(): Promise<number> {
  if (process.platform === "linux" && systemdAvailable()) {
    const active = spawnSync("systemctl", ["--user", "is-active", `${UNIT_NAME}.timer`], {
      encoding: "utf8",
    });
    console.log(`Temporizador: ${(active.stdout || "inactive").trim()}`);
  } else {
    console.log("Temporizador: no disponible fuera de systemd/Linux");
  }
  const stored = readSecrets()[BACKUP_PASSPHRASE_SECRET];
  console.log(`Contraseña de copia guardada: ${stored ? "sí" : "no"}`);
  const dir = await runnerDir();
  if (!dir) return 1;
  return run(process.execPath, [join(dir, ".output", "jobs", "index.mjs"), "status"], {
    cwd: process.cwd(),
  });
}

/** Store (or clear) the passphrase an unattended backup uses. */
function passphrase(args: string[]): number {
  const secrets = readSecrets();
  if (args.includes("--clear")) {
    delete secrets[BACKUP_PASSPHRASE_SECRET];
    writeSecrets(secrets);
    console.log("✓ Contraseña de copia eliminada: las copias programadas no se crearán.");
    return 0;
  }
  const value = (process.env[BACKUP_PASSPHRASE_ENV] ?? readFileSync(0, "utf8")).trim();
  if (value.length < 8 || value.length > 200) {
    console.error("La contraseña debe tener entre 8 y 200 caracteres.");
    return 1;
  }
  secrets[BACKUP_PASSPHRASE_SECRET] = value;
  writeSecrets(secrets);
  console.log("✓ Contraseña guardada (fichero de secretos, permisos 600).");
  return 0;
}

export async function cmdJobs(args: string[] = []): Promise<number> {
  const sub = args[0] ?? "run";
  switch (sub) {
    case "run":
      return runOnce();
    case "install":
      return install();
    case "uninstall":
      return uninstall();
    case "status":
      return status();
    case "passphrase":
      return passphrase(args.slice(1));
    default:
      console.error(`Comando desconocido: jobs ${sub}`);
      console.error(
        "Uso: openexpert jobs [run|install|uninstall|status|passphrase [--clear]]\n" +
          "  run         ejecuta ahora lo que esté pendiente (informe diario y copia)\n" +
          "  install     instala el temporizador de systemd (Linux)\n" +
          "  uninstall   lo desinstala\n" +
          "  status      muestra el estado\n" +
          "  passphrase  guarda la contraseña de la copia leyéndola por stdin",
      );
      return 2;
  }
}
