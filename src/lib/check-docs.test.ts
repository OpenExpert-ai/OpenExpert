// SPDX-License-Identifier: MIT
// La puerta de enlaces (`scripts/check-docs.mjs`) dice comprobar «cada enlace
// relativo de la documentación y, cuando lo lleva, su anclaje», y deja fuera los
// dos casos que más se usan en un documento largo:
//
//   1. El anclaje al propio fichero. `raw.startsWith("#")` manda al siguiente
//      enlace sin mirar el ancla, así que `[ver](#paso-que-no-existe)` sale
//      verde: es el enlace que se rompe al renombrar un apartado, justo lo que
//      la puerta promete vigilar.
//   2. El encabezado repetido. Los slugs se guardan en un `Set`, de modo que dos
//      `## Instalación` producen una sola entrada `instalacion`; GitHub numera la
//      segunda como `#instalacion-1` y es la que la gente enlaza. La puerta la
//      declara rota (`missing anchor`) y tumba CI sobre un enlace bueno.
//
// Cada caso va en su propio repositorio de usar y tirar: si compartieran uno, el
// rojo del primero taparía el veredicto del segundo y el test pasaría por el
// motivo equivocado.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../../scripts/check-docs.mjs", import.meta.url));

const dirs: string[] = [];

/** Un repositorio git mínimo con esos ficheros Markdown (`nombre` → contenido). */
function docsRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "check-docs-"));
  dirs.push(dir);
  const git = (...args: string[]) =>
    spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=test", ...args], {
      cwd: dir,
      encoding: "utf8",
    });
  const init = git("init", "-q");
  expect(init.status).toBe(0);
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(dir, name), content, "utf8");
  // `git ls-files` lee el índice: basta con añadirlos, no hace falta commitear.
  const add = git("add", "-A");
  expect(add.status).toBe(0);
  return dir;
}

function runCheckDocs(cwd: string): { status: number | null; output: string } {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("la puerta de enlaces de la documentación", () => {
  it("marca como roto el anclaje del propio fichero que no existe", { timeout: 20_000 }, () => {
    const dir = docsRepo({
      "guia.md": "# Guía\n\n## Instalación\n\nVer [el paso que falta](#paso-que-no-existe).\n",
    });

    const { status, output } = runCheckDocs(dir);

    expect(output).toContain("paso-que-no-existe");
    expect(status).toBe(1);
  });

  it(
    "acepta el ancla de la segunda aparición de un encabezado repetido",
    { timeout: 20_000 },
    () => {
      // GitHub numera la segunda «Instalación» como `#instalacion-1`; el enlace es válido.
      const dir = docsRepo({
        "guia.md":
          "# Guía\n\n## Instalación\n\ntexto\n\n## Instalación\n\nSegundo paso: [aquí](guia.md#instalación-1).\n",
      });

      const { status, output } = runCheckDocs(dir);

      expect(output).not.toContain("missing anchor");
      expect(status).toBe(0);
    },
  );

  it("el ancla del primer encabezado repetido sigue resolviendo", { timeout: 20_000 }, () => {
    const dir = docsRepo({
      "guia.md":
        "# Guía\n\n## Instalación\n\ntexto\n\n## Instalación\n\nPrimer paso: [aquí](guia.md#instalación).\n",
    });

    const { status } = runCheckDocs(dir);

    expect(status).toBe(0);
  });
});
