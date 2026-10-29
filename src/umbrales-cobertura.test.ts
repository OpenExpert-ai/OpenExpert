// SPDX-License-Identifier: MIT
// El umbral de cobertura del CI tiene que hablar del presente.
//
// `vitest.config.ts` declara `thresholds` y el paso «Test with coverage» de
// `.github/workflows/ci.yml` es el único sitio donde muerden: `npx vitest run`
// no aplica umbrales. Medido el 29/10 sobre el `include` del propio config
// (`src/lib/**/*.ts`), la cobertura real es 89,99 % de sentencias, 81,35 % de
// ramas, 91,56 % de funciones y 91,96 % de líneas, mientras el config pedía
// 64/56/65/65: veinticinco puntos de holgura, o sea que el job seguía verde con
// un cuarto de la suite borrada. Un umbral así no es una puerta, es un número
// que nadie ha vuelto a mirar.
//
// Los suelos de aquí van unos cuatro puntos por debajo de lo medido a propósito:
// una bajada legítima (un fichero nuevo con su primera rama sin cubrir) no puede
// poner rojo un cambio ajeno, y un derrumbe de verdad sí. Cuando la cobertura
// suba, se suben; lo que no vale es dejarlos envejecer.
//
// El config se lee como texto, igual que en `src/puertas-cobertura.test.ts`:
// importarlo evaluaría `__dirname` como lo hace el bundler.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONFIG = fileURLToPath(new URL("../vitest.config.ts", import.meta.url));

/** Los cuatro suelos que este repo se compromete a mantener, y lo medido el 29/10. */
const FLOORS = {
  statements: { floor: 85, measured: 89.99 },
  branches: { floor: 77, measured: 81.35 },
  functions: { floor: 87, measured: 91.56 },
  lines: { floor: 87, measured: 91.96 },
} as const;

type Metric = keyof typeof FLOORS;

/**
 * Los umbrales declarados en el config, leídos del bloque `thresholds` por el
 * nombre de cada métrica: el bloque de `coverage` tiene otros números (el
 * `include`, los reporters) y tomarlos por posición leería el sitio equivocado.
 */
function declared(): Record<Metric, number | null> {
  const text = readFileSync(CONFIG, "utf8");
  const block = /thresholds:\s*\{([\s\S]*?)\}/.exec(text);
  if (!block?.[1]) throw new Error("vitest.config.ts no declara un bloque coverage.thresholds.");
  const body = block[1];
  const out = {} as Record<Metric, number | null>;
  for (const metric of Object.keys(FLOORS) as Metric[]) {
    const hit = new RegExp(`\\b${metric}:\\s*(\\d+(?:\\.\\d+)?)`).exec(body);
    out[metric] = hit?.[1] ? Number(hit[1]) : null;
  }
  return out;
}

describe("umbrales de cobertura del CI", () => {
  it("el bloque thresholds declara las cuatro métricas", () => {
    const values = declared();
    const missing = (Object.keys(FLOORS) as Metric[]).filter((m) => values[m] === null);
    expect(missing, `Sin umbral en coverage.thresholds: ${missing.join(", ")}`).toEqual([]);
  });

  for (const metric of Object.keys(FLOORS) as Metric[]) {
    it(`pide al menos ${FLOORS[metric].floor} % de ${metric} (hay ${FLOORS[metric].measured} %)`, () => {
      const value = declared()[metric];
      expect(
        value,
        `coverage.thresholds.${metric} vale ${value ?? "nada"} y este repo mide ` +
          `${FLOORS[metric].measured} %: por debajo de ${FLOORS[metric].floor} el job no ` +
          `distingue un cambio limpio de una suite a la que le falta un cuarto.`,
      ).toBeGreaterThanOrEqual(FLOORS[metric].floor);
    });
  }
});
