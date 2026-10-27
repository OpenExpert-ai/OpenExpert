// SPDX-License-Identifier: MIT
// Una factura vence por su fecha, no por una etiqueta que nadie escribe.
//
// `overdueInvoices` solo miraba `status === "overdue"`, y ese valor no lo
// produce ningún camino de la aplicación: el importador de CSV y el conector de
// Holded guardan `open`, y los datos de ejemplo también. Con datos reales la
// herramienta contestaba una lista vacía aunque hubiera deudas con el
// vencimiento pasado.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-vencidas-"));
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

async function ee() {
  return import("./ee.server");
}

/**
 * El día de calendario de hoy desplazado `days` días, con el formato que guarda
 * la aplicación. Se construye en hora local, así que la prueba no depende de la
 * hora a la que corra ni del huso de la máquina.
 */
function day(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const INSERT =
  "INSERT INTO invoices (id,client,amount,due_date,status,reminders) VALUES (?,?,?,?,?,?)";

describe("overdueInvoices: la fecha de vencimiento decide", () => {
  it("lista las impagadas con el vencimiento pasado, aunque entraran como «open»", async () => {
    const db = await raw();
    db.run("DELETE FROM invoices");
    // Las dos primeras son las de los datos de ejemplo, con su estado real.
    db.run(INSERT, ["v-1", "Clínica Dental Málaga", 2400, day(-42), "open", 2]);
    db.run(INSERT, ["v-2", "Grupo Costa Sol", 12000, day(-30), "open", 1]);

    const rows = await (await ee()).overdueInvoices(null);
    expect(rows.map((i) => i.client)).toEqual(["Grupo Costa Sol", "Clínica Dental Málaga"]);
    expect(rows.map((i) => i.daysOverdue)).toEqual([30, 42]);
    expect(rows.map((i) => i.amount)).toEqual([12000, 2400]);
    expect(rows.map((i) => i.reminders)).toEqual([1, 2]);
  });

  it("no lista una factura pagada ni una anulada con el vencimiento pasado", async () => {
    const db = await raw();
    db.run("DELETE FROM invoices");
    db.run(INSERT, ["p-1", "Pagada", 900, day(-30), "paid", 0]);
    db.run(INSERT, ["c-1", "Anulada", 900, day(-30), "cancelled", 0]);

    expect(await (await ee()).overdueInvoices(null)).toEqual([]);
  });

  it("no lista la que vence hoy ni la que vence más adelante, y respeta el importe mínimo", async () => {
    const db = await raw();
    db.run("DELETE FROM invoices");
    db.run(INSERT, ["hoy", "Vence hoy", 1000, day(0), "open", 0]);
    db.run(INSERT, ["futura", "Vence luego", 2000, day(10), "open", 0]);
    db.run(INSERT, ["pequena", "Pequeña", 500, day(-10), "open", 0]);
    db.run(INSERT, ["grande", "Grande", 6000, day(-10), "open", 0]);

    const all = await (await ee()).overdueInvoices(null);
    expect(all.map((i) => i.client)).toEqual(["Grande", "Pequeña"]);
    expect(all.map((i) => i.daysOverdue)).toEqual([10, 10]);

    const over = await (await ee()).overdueInvoices(5000);
    expect(over.map((i) => i.client)).toEqual(["Grande"]);
  });

  it("sigue listando la que está marcada a mano como «overdue»", async () => {
    const db = await raw();
    db.run("DELETE FROM invoices");
    // Dato sucio que ya estaba cubierto: marcada a mano y con la fecha sin
    // llegar; se lista con 0 días de retraso y nunca con un número negativo.
    db.run(INSERT, ["m-1", "Marcada a mano", 800, day(30), "overdue", 0]);

    const rows = await (await ee()).overdueInvoices(null);
    expect(rows.map((i) => i.client)).toEqual(["Marcada a mano"]);
    expect(rows[0]!.daysOverdue).toBe(0);
  });
});
