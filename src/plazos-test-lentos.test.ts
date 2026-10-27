// SPDX-License-Identifier: MIT
// Los ficheros de test que cruzan los 5 s por defecto llevan su propio plazo.
//
// La puerta de CI es `npm run test:coverage` (.github/workflows/ci.yml:130) y corre
// los 78 ficheros en paralelo con el proveedor v8. Medido en `main` (768df2a) dos
// veces seguidas, la misma orden dio «3 failed | 861 passed | 2 skipped» y
// «864 passed | 2 skipped»: los tres rojos eran `Error: Test timed out in 5000ms`,
// no aserciones. El trabajo de esos tests no cabe en el defecto cuando la máquina
// va cargada.
//
// Subir `testTimeout` en `vitest.config.ts` esconde el síntoma: un cuelgue de
// verdad de cualquier otro test tardaría lo mismo en salir. El plazo se pone por
// caso, en el `it(...)` del fichero que lo necesita, y esta prueba impide que se
// pierda en el próximo retoque de esos dos ficheros.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("..", import.meta.url));

/** Los ficheros que no caben en el plazo por defecto, y por qué. */
const LENTOS: Record<string, string> = {
  "src/lib/ai/tools.local-caps.test.ts":
    "siembra 5 251 ficheros en `beforeAll` e importa `./tools` en caliente",
  "src/routes/_authenticated/-settings.ai.test.tsx":
    "importa `./settings.ai` (TSX) dentro del test y espera a que el panel esté montado",
};

/** El plazo de un argumento, si es un número literal (`30_000` o `30000`). */
function plazoDe(nodo: ts.Node | undefined): number | null {
  if (!nodo || !ts.isNumericLiteral(nodo)) return null;
  return Number(nodo.text.replace(/_/g, ""));
}

/** Cada `it(...)` del fichero con el plazo que declara: `null` si no declara ninguno. */
function plazosDe(fichero: string): { nombre: string; plazo: number | null }[] {
  const ruta = join(REPO, fichero);
  const fuente = ts.createSourceFile(
    ruta,
    readFileSync(ruta, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    fichero.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const casos: { nombre: string; plazo: number | null }[] = [];
  const visitar = (nodo: ts.Node): void => {
    if (
      ts.isCallExpression(nodo) &&
      ts.isIdentifier(nodo.expression) &&
      nodo.expression.text === "it"
    ) {
      const titulo = nodo.arguments[0];
      casos.push({
        nombre: titulo && ts.isStringLiteralLike(titulo) ? titulo.text : "(título no literal)",
        // `it(nombre, fn, plazo)`: el plazo es el tercer argumento.
        plazo: plazoDe(nodo.arguments[2]),
      });
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(fuente);
  return casos;
}

describe("plazos de los tests lentos", () => {
  for (const [fichero, motivo] of Object.entries(LENTOS)) {
    it(`«${fichero}» da plazo propio a cada caso (${motivo})`, () => {
      const casos = plazosDe(fichero);
      expect(casos.length).toBeGreaterThan(0);

      const sinPlazo = casos.filter((c) => c.plazo === null).map((c) => c.nombre);
      expect({
        fichero,
        sinPlazo,
      }).toEqual({ fichero, sinPlazo: [] });

      // Un plazo que no supere de largo el defecto de 5 000 ms no arregla nada.
      const cortos = casos.filter((c) => (c.plazo ?? 0) < 15_000).map((c) => c.nombre);
      expect({ fichero, cortos }).toEqual({ fichero, cortos: [] });
    });
  }

  it("el plazo global sigue en el defecto: un cuelgue de otro test sale en 5 s", () => {
    const config = readFileSync(join(REPO, "vitest.config.ts"), "utf8");
    expect(config).not.toMatch(/\btestTimeout\b/);
    expect(config).not.toMatch(/\bhookTimeout\b/);
  });
});
