// SPDX-License-Identifier: MIT
// El estado de una fila importada se guarda tal cual y todos los lectores exigen
// el vocabulario inglés en minúsculas: `open`/`won`/`lost` para ventas,
// `paid`/`cancelled`/`open`/`overdue` para facturas y `active`/`paused` para
// campañas (`ee.server.ts:143`, `:180`, `:205` y `ai/tools.ts:337`). Los
// conectores normalizan (`connectors.ts:104`), pero el importador de CSV no
// (`business-csv.ts:356`, `:378`, `:391`), que es la vía que usa todo el mundo.
//
// Lo que ve el usuario cuando su CRM exporta en castellano: el pipeline contesta
// 0 € abiertos y 0 % de win rate sobre una tabla llena, una factura «Pagada»
// aparece vencida y el asistente propone reclamar el cobro a un cliente que ya
// pagó, y una campaña «ACTIVA» no se puede pausar porque el filtro busca
// exactamente «active». Un estado que el lector no reconoce tampoco debería
// guardarse en silencio: la fila se rechaza nombrando el valor, como ya pasa con
// un importe que no es un número o una fecha que no existe.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseBusinessCsv } from "./business-csv";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-estados-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

async function raw() {
  const { getDb } = await import("./db.server");
  return (await getDb()).raw;
}

/** Los estados que el parser devolvió, en el orden del fichero. */
function statuses(rows: { data: unknown }[]): unknown[] {
  return rows.map((r) => (r.data as { status: string }).status);
}

const DEALS_IN_SPANISH = [
  "Empresa,Etapa,Valor,Estado",
  "Acme,Negociación,1000,Ganado",
  "Beta,Demo,500,Abierto",
  "Gamma,Propuesta,300,Perdido",
  "Delta,Demo,200,Closed Won",
  "Epsilon,Demo,100,ganada",
  "",
].join("\n");

describe("estado de una venta importada", () => {
  it("se guarda como open/won/lost aunque la celda venga en castellano", () => {
    const parsed = parseBusinessCsv("deals", DEALS_IN_SPANISH);
    expect(parsed.errors).toEqual([]);
    expect(statuses(parsed.rows)).toEqual(["won", "open", "lost", "won", "won"]);
  });

  it("rechaza la fila cuyo estado no reconoce, nombrando el valor y los aceptados", () => {
    const csv = ["Empresa,Etapa,Valor,Estado", "Acme,Demo,100,En revisión", ""].join("\n");
    const parsed = parseBusinessCsv("deals", csv);
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]?.row).toBe(2);
    expect(parsed.errors[0]?.message).toContain("En revisión");
    // Los tres estados canónicos, para que el usuario sepa qué escribir.
    expect(parsed.errors[0]?.message).toContain("open");
    expect(parsed.errors[0]?.message).toContain("won");
    expect(parsed.errors[0]?.message).toContain("lost");
  });

  it("una celda vacía sigue valiendo open", () => {
    const csv = ["Empresa,Etapa,Valor,Estado", "Acme,Demo,100,", ""].join("\n");
    const parsed = parseBusinessCsv("deals", csv);
    expect(parsed.errors).toEqual([]);
    expect(statuses(parsed.rows)).toEqual(["open"]);
  });
});

describe("estado de una factura importada", () => {
  it("se guarda con el vocabulario del lector aunque venga en castellano", () => {
    const csv = [
      "Cliente,Importe,Vencimiento,Estado",
      "Uno,100,2026-01-01,Pagada",
      "Dos,200,2026-01-02,Anulada",
      "Tres,300,2026-01-03,Pendiente",
      "Cuatro,400,2026-01-04,Vencida",
      "",
    ].join("\n");
    const parsed = parseBusinessCsv("invoices", csv);
    expect(parsed.errors).toEqual([]);
    expect(statuses(parsed.rows)).toEqual(["paid", "cancelled", "open", "overdue"]);
  });
});

describe("estado de una campaña importada", () => {
  it("se guarda como active/paused aunque venga en castellano o en mayúsculas", () => {
    const csv = [
      "Nombre,Estado",
      "Lanzamiento,ACTIVA",
      "Retargeting,Pausada",
      "Marca,enabled",
      "",
    ].join("\n");
    const parsed = parseBusinessCsv("campaigns", csv);
    expect(parsed.errors).toEqual([]);
    expect(statuses(parsed.rows)).toEqual(["active", "paused", "active"]);
  });
});

describe("lo que leen el panel y el asistente sobre un CSV en castellano", () => {
  it("las ventas entran en el pipeline en vez de contarse como cero", async () => {
    const db = await raw();
    db.run("DELETE FROM deals");
    const parsed = parseBusinessCsv("deals", DEALS_IN_SPANISH);
    const { importBusinessRows } = await import("./business-import.server");
    await importBusinessRows("deals", parsed.rows);

    const ee = await import("./ee.server");
    const summary = await ee.pipelineSummary();
    // Abierto: solo Beta (500). Ganadas: Acme (1000), Delta (200) y Epsilon
    // (100), que es lo que da un win rate de 3/4 frente a la perdida de Gamma.
    expect(summary.openDeals).toBe(1);
    expect(summary.openValue).toBe(500);
    expect(summary.winRate).toBeCloseTo(3 / 4);
    expect(summary.byStage).toEqual({ Demo: { count: 1, value: 500 } });
  });

  it("una factura «Pagada» no se propone para reclamar el cobro", async () => {
    const db = await raw();
    db.run("DELETE FROM invoices");
    const csv = [
      "Cliente,Importe,Vencimiento,Estado",
      "Pagada hace meses,100,2020-01-01,Pagada",
      "Sin pagar,200,2020-01-01,Pendiente",
      "",
    ].join("\n");
    const parsed = parseBusinessCsv("invoices", csv);
    const { importBusinessRows } = await import("./business-import.server");
    await importBusinessRows("invoices", parsed.rows);

    const ee = await import("./ee.server");
    const overdue = await ee.overdueInvoices(null);
    expect(overdue.map((i) => i.client)).toEqual(["Sin pagar"]);
  });
});
