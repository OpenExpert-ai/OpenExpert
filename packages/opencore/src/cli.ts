// SPDX-License-Identifier: MIT
// OpenCore CLI entry point. Dispatches subcommands. See `run`.

import { cmdDoctor, cmdFix, cmdModels, cmdServe, cmdUpdate, cmdVersion } from "./cli/commands.js";
import { runWizard } from "./cli/wizard.js";

function help(): void {
  console.log(`opencore — motor abierto de OpenExpert

Uso:
  opencore            asistente de configuración y arranque
  opencore init       igual que sin argumentos
  opencore serve      arranca la edición local en http://localhost:3000
  opencore doctor     revisa tu configuración
  opencore fix        auto-configura lo que falte
  opencore models     lista los modelos del proveedor actual
  opencore update     limpia la caché del servidor descargado
  opencore version    muestra la versión

Ejemplos:
  npx @openexpert/opencore
  npx @openexpert/opencore serve

Docker (sin Node):
  docker run -p 3000:3000 -v openexpert-data:/data ghcr.io/openexpert/openexpert`);
}

export async function run(argv: string[]): Promise<void> {
  const cmd = argv[0] ?? "";
  switch (cmd) {
    case "":
    case "init":
    case "setup": {
      const res = await runWizard({});
      if (res.started) process.exit(await cmdServe());
      return;
    }
    case "doctor":
      return process.exit(cmdDoctor());
    case "fix":
      return process.exit(await cmdFix());
    case "models":
      return process.exit(await cmdModels());
    case "serve":
    case "dev":
      return process.exit(await cmdServe());
    case "update":
      return process.exit(cmdUpdate());
    case "version":
    case "--version":
    case "-v":
      return process.exit(cmdVersion());
    case "help":
    case "--help":
    case "-h":
      help();
      return;
    default:
      console.error(`Comando desconocido: ${cmd}\n`);
      help();
      return process.exit(1);
  }
}
