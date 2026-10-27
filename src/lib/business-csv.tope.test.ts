// SPDX-License-Identifier: MIT
// El tope de filas del importador se anuncia con su recuento.
//
// Un fichero de 5.237 negocios importaba 5.000 y avisaba de «una fila con
// error»: las 237 de detrás del tope desaparecían sin que ningún número las
// contara, y el usuario leía que su exportación estaba entera menos una fila.
import { describe, expect, it } from "vitest";
import { parseBusinessCsv, type CsvParseResult } from "./business-csv";

/**
 * El recuento que falta. Se lee con una forma local para que el rojo sea la
 * aserción y no un error de tipos: el resultado todavía no publica el campo.
 */
function omitted(res: CsvParseResult): number {
  return (res as unknown as { omitted: number }).omitted;
}

const HEADER = "id,company,stage,value,owner,daysInStage,closeDate,status";

function csv(rows: number, overrides: Record<number, string> = {}): string {
  const lines = [HEADER];
  for (let i = 1; i <= rows; i++) {
    lines.push(overrides[i] ?? `d${i},Empresa ${i},Demo,100,x,1,2026-12-01,open`);
  }
  return lines.join("\n");
}

describe("parseBusinessCsv: el tope de filas", () => {
  it("dice cuántas filas se quedaron fuera del tope", () => {
    const res = parseBusinessCsv("deals", csv(5237));
    expect(res.rows).toHaveLength(5000);
    // Las 237 de detrás del tope no son filas rotas: son filas que no se leyeron.
    expect(omitted(res)).toBe(237);
    expect(res.errors).toEqual([]);
  });

  it("no cuenta el tope como una fila con error", () => {
    // La fila 4 no tiene empresa: esa sí es una fila con error, y es la única.
    const res = parseBusinessCsv("deals", csv(5237, { 4: "d4,,Demo,100,x,1,2026-12-01,open" }));
    expect(res.rows).toHaveLength(5000);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]!.row).toBe(5);
    expect(res.errors[0]!.message).toBe("Falta company (empresa).");
    // 5.237 filas = 5.000 importadas + 1 rota + 236 detrás del tope.
    expect(omitted(res)).toBe(236);
  });

  it("no avisa de nada cuando el fichero cabe entero", () => {
    const exacto = parseBusinessCsv("deals", csv(5000));
    expect(exacto.rows).toHaveLength(5000);
    expect(omitted(exacto)).toBe(0);
    expect(exacto.errors).toEqual([]);

    const corto = parseBusinessCsv("deals", csv(100));
    expect(corto.rows).toHaveLength(100);
    expect(omitted(corto)).toBe(0);
    expect(corto.errors).toEqual([]);
  });
});
