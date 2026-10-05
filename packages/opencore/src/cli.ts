// SPDX-License-Identifier: MIT
// OpenCore CLI entry point. Dispatches subcommands. See `run`.

import { cmdDoctor, cmdFix, cmdModels, cmdServe, cmdUpdate, cmdVersion } from "./cli/commands.js";
import { cmdDesktop } from "./cli/desktop.js";
import { runWizard } from "./cli/wizard.js";

function help(): void {
  console.log(`OpenExpert — motor local

Uso:
  openexpert            asistente de configuración y arranque
  openexpert init       igual que sin argumentos
  openexpert serve      arranca la edición local en http://localhost:3000
  openexpert desktop    arranca el servidor y abre la ventana de escritorio
  openexpert doctor     revisa tu configuración
  openexpert fix        auto-configura lo que falte
  openexpert models     lista los modelos del proveedor actual
  openexpert update     limpia la caché del servidor descargado
  openexpert version    muestra la versión

Ejemplos:
  npx @openexpert/opencore
  npx @openexpert/opencore serve

Docker (sin Node):
  docker run -p 3000:3000 -v openexpert-data:/data ghcr.io/openexpert-ai/openexpert`);
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
    case "desktop":
    case "app": {
      const code = await cmdDesktop();
      return process.exit(code);
    }
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
