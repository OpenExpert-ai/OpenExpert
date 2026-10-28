// SPDX-License-Identifier: MIT
// El recuento de una importación es el de las filas escritas, no el de las
// apariciones de un id.
//
// `importBusinessRows` (business-import.server.ts) lee una sola vez, ANTES de
// escribir, el conjunto de ids que ya existían, y después cuenta con él dentro
// del bucle: `if (existing.has(row.id)) updated++; else inserted++`. Si el
// fichero trae el mismo id dos veces —dos exportaciones concatenadas, una
// factura repetida—, la segunda pasada ACTUALIZA la fila que acaba de insertar
// la primera, pero `existing` no la conoce y vuelve a contarla como nueva.
//
// El panel dice entonces «2 importados» sobre una tabla con una sola fila, y el
// total de la importación no cuadra con lo que hay en la base. Es el mismo
// contrato que ya se arregló en esta pantalla para las filas rechazadas y para
// el tope de filas: el número que se enseña es el que se dice de verdad.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseBusinessCsv } from "./business-csv";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-import-dup-"));
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

/** Cuenta las filas de una tabla sin depender del ORM. */
async function countRows(table: "invoices" | "deals"): Promise<number> {
  const db = await raw();
  const stmt = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`);
  stmt.step();
  const row = stmt.getAsObject() as { n?: number };
  stmt.free();
  return Number(row.n ?? 0);
}

const TWO_ROWS_SAME_ID = [
  "id,client,amount,dueDate,status",
  "i1,Cliente Uno,1200.50,2026-02-01,open",
  "i1,Cliente Uno,1200.50,2026-02-01,open",
  "",
].join("\n");

const TWO_ROWS_DISTINCT_IDS = [
  "id,client,amount,dueDate,status",
  "d1,Cliente Uno,1200.50,2026-02-01,open",
  "d2,Cliente Dos,980.00,2026-03-15,open",
  "",
].join("\n");

describe("importBusinessRows: un id repetido en el mismo fichero", () => {
  it("no cuenta como nueva la fila que el propio fichero repite", async () => {
    const db = await raw();
    db.run("DELETE FROM invoices");
    const parsed = parseBusinessCsv("invoices", TWO_ROWS_SAME_ID);
    expect(parsed.rows).toHaveLength(2);

    const { importBusinessRows } = await import("./business-import.server");
    const first = await importBusinessRows("invoices", parsed.rows);

    // Una sola fila en la base: solo una puede ser nueva.
    expect(await countRows("invoices")).toBe(1);
    expect(first.inserted).toBe(1);
    // Los dos registros del fichero se escriben una vez cada uno: el segundo es
    // una actualización de la fila que acaba de entrar, no una inserción.
    expect(first.inserted + first.updated).toBe(2);

    // Volver a importar el mismo fichero no inserta nada nuevo.
    const second = await importBusinessRows("invoices", parsed.rows);
    expect(second.inserted).toBe(0);
    expect(await countRows("invoices")).toBe(1);
  });

  it("sigue contando bien un fichero sin ids repetidos", async () => {
    const db = await raw();
    db.run("DELETE FROM invoices");
    const parsed = parseBusinessCsv("invoices", TWO_ROWS_DISTINCT_IDS);

    const { importBusinessRows } = await import("./business-import.server");
    const first = await importBusinessRows("invoices", parsed.rows);
    expect(first).toMatchObject({ inserted: 2, updated: 0 });
    expect(await countRows("invoices")).toBe(2);

    const second = await importBusinessRows("invoices", parsed.rows);
    expect(second).toMatchObject({ inserted: 0, updated: 2 });
    expect(await countRows("invoices")).toBe(2);
  });
});
