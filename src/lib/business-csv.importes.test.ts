// SPDX-License-Identifier: MIT
// Una celda de importe que no se entiende no puede entrar como 0 euros.
//
// `parseNumber` cambia por 0 lo que no sabe leer, y los campos de dinero usan
// ese 0 como si fuera el dato: la fila se importa, la importación no avisa y la
// factura queda en 0 euros. El panel la ordena y la suma como cero y la
// herramienta de facturas vencidas le pasa ese 0 al modelo.
import { describe, expect, it } from "vitest";
import { parseBusinessCsv } from "./business-csv";

const invoices = (rows: string[]) => ["id,cliente,importe,vencimiento", ...rows].join("\n");

describe("parseBusinessCsv y un importe ilegible", () => {
  it("no importa la factura cuyo importe no es un número", () => {
    const out = parseBusinessCsv(
      "invoices",
      invoices(['i-1,Talleres,"1.234,56 (IVA)",30/09/2026']),
    );
    expect(out.rows).toEqual([]);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]?.row).toBe(2);
    expect(out.errors[0]?.message).toMatch(/importe|amount/i);
  });

  it("importa las demás filas del mismo fichero", () => {
    const out = parseBusinessCsv(
      "invoices",
      invoices(['i-1,Talleres,"1.234,56 (IVA)",30/09/2026', "i-2,Sur,900,30/09/2026"]),
    );
    expect(out.errors).toHaveLength(1);
    const ids = out.rows.flatMap((r) => (r.entity === "invoices" ? [r.data.id] : []));
    const amounts = out.rows.flatMap((r) => (r.entity === "invoices" ? [r.data.amount] : []));
    expect(ids).toEqual(["i-2"]);
    expect(amounts).toEqual([900]);
  });

  it("tampoco importa un deal con el valor ilegible", () => {
    const out = parseBusinessCsv(
      "deals",
      ["id,empresa,valor", 'd-1,Talleres,"8.400 €/mes"'].join("\n"),
    );
    expect(out.rows).toEqual([]);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]?.row).toBe(2);
  });

  it("una celda vacía sigue valiendo 0 y no es un error", () => {
    const out = parseBusinessCsv(
      "invoices",
      ["id,cliente,vencimiento", "i-1,Sur,30/09/2026"].join("\n"),
    );
    expect(out.errors).toEqual([]);
    const amounts = out.rows.flatMap((r) => (r.entity === "invoices" ? [r.data.amount] : []));
    expect(amounts).toEqual([0]);
  });
});
