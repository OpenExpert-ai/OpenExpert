// SPDX-License-Identifier: MIT
// Las dependencias de producción que npm marca como vulnerables no se quedan en
// el árbol. Ningún job del CI corre `npm audit`, así que el aviso de hoy
// (`seroval`, el serializador de TanStack Start, 1.6.8 dentro de 1.5.5-1.6.10)
// solo se ve cuando alguien se acuerda de preguntar: la puerta vive aquí.
//
// La lista es de avisos con nombre y rango, no «ejecuta npm audit»: un test que
// sale a la red no se puede correr en una pasada, y el lockfile ya dice la
// versión que se instala. Cuando aparezca un aviso nuevo se añade aquí con su
// GHSA y su rango, y el rojo nombra el paquete, la versión y el aviso, que es lo
// que hace falta para arreglarlo en un minuto.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const LOCK = fileURLToPath(new URL("../package-lock.json", import.meta.url));

/** Un tramo de versiones afectadas, con los dos extremos incluidos. */
type Vulnerable = { id: string; title: string; from: string; to: string };

type Audited = { name: string; advisories: Vulnerable[] };

/**
 * Los avisos abiertos sobre dependencias de producción, tal como los publica
 * npm (`npm audit --omit=dev`). El rango es el del aviso, no el de la
 * corrección: una versión fuera del tramo no está afectada.
 */
const AUDITED: Audited[] = [
  {
    name: "seroval",
    advisories: [
      {
        id: "GHSA-f86p-h4j2-7qgj",
        title: "Code injection through a typed array's own constructor property",
        from: "1.5.5",
        to: "1.6.10",
      },
      {
        id: "GHSA-9wx9-5pv9-3349",
        title: "Script injection through RegExp sources in serialized output",
        from: "1.5.5",
        to: "1.6.10",
      },
    ],
  },
];

type Triple = [number, number, number];

/** `1.6.8` → `[1, 6, 8]`; el sufijo de un prerelease no cambia el tramo. */
function parts(version: string): Triple {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) throw new Error(`«${version}» no es una versión que se pueda comparar con un rango.`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(a: Triple, b: Triple): number {
  for (let i = 0; i < 3; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

function affected(version: string, advisory: Vulnerable): boolean {
  const v = parts(version);
  return compare(v, parts(advisory.from)) >= 0 && compare(v, parts(advisory.to)) <= 0;
}

/** Every installation of `name` in the lockfile, nested ones included. */
function installed(name: string): { path: string; version: string }[] {
  const lock = JSON.parse(readFileSync(LOCK, "utf8")) as {
    packages?: Record<string, { version?: string }>;
  };
  const out: { path: string; version: string }[] = [];
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (path !== `node_modules/${name}` && !path.endsWith(`/node_modules/${name}`)) continue;
    const version = (entry.version ?? "").trim();
    if (version) out.push({ path, version });
  }
  return out;
}

describe("dependencias de producción con aviso abierto", () => {
  it("el lockfile declara al menos una copia de cada paquete auditado", () => {
    // Sin copia no hay nada que comprobar y el resto del fichero pasaría en
    // verde por vacío: el paquete de la lista que ya no se instala se quita de
    // `AUDITED` en el mismo cambio.
    const missing = AUDITED.filter((entry) => installed(entry.name).length === 0).map(
      (entry) => entry.name,
    );
    expect(missing, `Ya no se instala ningún ${missing.join(", ")}: quítalo de AUDITED.`).toEqual(
      [],
    );
  });

  it("ninguna copia instalada cae en el rango de un aviso", () => {
    const found: string[] = [];
    for (const entry of AUDITED) {
      for (const copy of installed(entry.name)) {
        for (const advisory of entry.advisories) {
          if (!affected(copy.version, advisory)) continue;
          found.push(
            `${copy.path}@${copy.version} está en ${advisory.from}-${advisory.to}: ` +
              `${advisory.id} (${advisory.title})`,
          );
        }
      }
    }
    expect(
      found,
      `\nDependencias de producción dentro de un aviso de npm (npm audit --omit=dev):\n  ` +
        `${found.join("\n  ")}\nActualiza el paquete dentro de su dependencia (npm audit fix) ` +
        `y pasa las puertas.\n`,
    ).toEqual([]);
  });
});
