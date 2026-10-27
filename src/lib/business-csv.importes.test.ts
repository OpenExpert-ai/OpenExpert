// SPDX-License-Identifier: MIT
// Una celda de importe que no se entiende no puede entrar como 0 euros.
//
// `parseNumber` cambia por 0 lo que no sabe leer, y los campos de dinero usan
// ese 0 como si fuera el dato: la fila se importa, la importación no avisa y la
// factura queda en 0 euros. El panel la ordena y la suma como cero y la
// herramienta de facturas vencidas le pasa ese 0 al modelo.
import { describe, expect, it } from "vitest";
import { parseBusinessCsv, parseMoney } from "./business-csv";

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

// Un punto con exactamente tres decimales se toma por separador de miles, y con la parte entera a
// cero eso no puede ser: nadie escribe `0.500` para decir quinientos. Un CSV en formato inglés con
// tres decimales multiplicaba el importe por mil —0,50 € entraba como 500 €— mientras el mismo valor
// escrito con coma entraba bien (`0,500` → 0,5), porque la rama de la coma siempre es decimal.
describe("parseMoney y el punto con tres decimales", () => {
  it("con la parte entera a cero el punto es decimal, no miles", () => {
    expect(parseMoney("0.500")).toBe(0.5);
    expect(parseMoney("-0.500")).toBe(-0.5);
    expect(parseMoney("0.125")).toBe(0.125);
  });

  it("no cambia los formatos que ya se leían bien", () => {
    expect(parseMoney("1.234")).toBe(1234);
    expect(parseMoney("2.750")).toBe(2750);
    expect(parseMoney("12.345")).toBe(12345);
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("1,234.56")).toBe(1234.56);
    expect(parseMoney("1234.56")).toBe(1234.56);
    expect(parseMoney("0,500")).toBe(0.5);
    expect(parseMoney("1,234")).toBe(1.234);
  });

  it("la factura importada lleva el importe que dice el fichero", () => {
    const out = parseBusinessCsv("invoices", invoices(["i-1,ACME,0.500,30/09/2026"]));
    expect(out.errors).toEqual([]);
    const amounts = out.rows.flatMap((r) => (r.entity === "invoices" ? [r.data.amount] : []));
    expect(amounts).toEqual([0.5]);
  });
});
