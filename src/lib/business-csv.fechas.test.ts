// SPDX-License-Identifier: MIT
// El importador tiene que dejar fuera la fecha que no existe.
//
// `parseDate` validaba el día por rango (1-31) y no contra el calendario, y la
// rama ISO devolvía el texto tal cual, así que `31/02/2026` entraba como
// `2026-02-31` y la fila se guardaba sin un solo error. El consumidor de esas
// fechas es `calendarDay`, que hace la ida y vuelta y devuelve null: la factura
// importada como vencida el 31 de febrero sale en el panel con «0 días» para
// siempre y nadie ve que la fecha está mal.
import { describe, expect, it } from "vitest";
import { parseBusinessCsv, parseDate } from "./business-csv";

describe("parseDate y los días que no existen", () => {
  it("no acepta un 31 de febrero en ninguno de los dos formatos", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("2026-02-31")).toBeNull();
    expect(parseDate("30/02/2026")).toBeNull();
    expect(parseDate("2026-04-31")).toBeNull();
  });

  it("sigue leyendo las fechas que existen, contando el bisiesto", () => {
    expect(parseDate("15/11/2026")).toBe("2026-11-15");
    expect(parseDate("2026-11-15")).toBe("2026-11-15");
    expect(parseDate("29/02/2028")).toBe("2028-02-29");
  });

  it("no deja pasar como fecha un texto que no lo es", () => {
    expect(parseDate("pendiente")).toBeNull();
    // Un año de dos cifras o se lee entero o se rechaza, pero no se guarda el texto.
    expect(parseDate("1/3/26")).not.toBe("1/3/26");
  });
});

describe("parseBusinessCsv y la fecha imposible", () => {
  it("rechaza la factura con el día que no existe, con su línea y el campo", () => {
    const out = parseBusinessCsv(
      "invoices",
      ["id,cliente,importe,vencimiento", "i-1,Talleres,6800,31/02/2026"].join("\n"),
    );
    expect(out.rows).toEqual([]);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]?.row).toBe(2);
    expect(out.errors[0]?.message).toMatch(/dueDate|vencimiento/i);
  });

  it("deja el cierre de un deal a null cuando el día no existe", () => {
    const out = parseBusinessCsv(
      "deals",
      ["id,empresa,fecha de cierre", "d-1,Talleres,31/02/2026"].join("\n"),
    );
    expect(out.errors).toEqual([]);
    const first = out.rows[0];
    expect(first?.entity).toBe("deals");
    if (first?.entity === "deals") expect(first.data.closeDate).toBeNull();
  });
});
