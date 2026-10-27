// SPDX-License-Identifier: MIT
// El conector de Holded tiene que leer la misma cifra que el importador de CSV.
//
// `mapHoldedInvoice` cambia la primera coma por un punto, así que `1.234,56`
// queda `1.234.56`, `Number` da NaN y el `|| 0` guarda la factura en 0 euros sin
// descartarla. `calendarDay` rechaza `2026-02-31`, así que esa fecha también
// tiene que dejar de entrar: la factura saldría con 0 días de vencimiento.
import { describe, expect, it } from "vitest";
import { mapHoldedInvoice } from "./connectors";

const invoice = (total: string | number) => ({
  id: "h-1",
  contact_name: "Talleres",
  total,
  due_date: "2026-09-30",
});

describe("mapHoldedInvoice y el importe", () => {
  it("lee el formato español con separador de miles", () => {
    expect(mapHoldedInvoice(invoice("1.234,56"))?.amount).toBe(1234.56);
  });

  it("sigue leyendo el formato inglés y el número", () => {
    expect(mapHoldedInvoice(invoice("1,234.56"))?.amount).toBe(1234.56);
    expect(mapHoldedInvoice(invoice("1234.56"))?.amount).toBe(1234.56);
    expect(mapHoldedInvoice(invoice(900))?.amount).toBe(900);
  });

  it("no acepta una fecha con un día que no existe", () => {
    expect(
      mapHoldedInvoice({ id: "h-2", contact_name: "Sur", total: 10, due_date: "2026-02-31" }),
    ).toBeNull();
  });

  it("descarta la fila cuando el importe no se puede leer", () => {
    expect(mapHoldedInvoice(invoice("mil euros"))).toBeNull();
  });
});
