// SPDX-License-Identifier: MIT
// Las herramientas de negocio que listan filas también dicen cuántas hay.
//
// `list_deals` (tools.ts) devuelve `ee.listDeals(stage)` y `list_overdue_invoices`
// devuelve `ee.overdueInvoices(minAmount)`; las dos leen la tabla entera
// (`select().from(...).all()`, sin `limit`) y contestan solo la lista: ni tope,
// ni recuento, ni `hasMore`. El resto del catálogo cumple lo contrario —
// `search_drive` (100 con `total` y `hasMore`), `list_local_files` (200 con
// `total`), Notion (5 páginas con `count`, `hasMore` y `nextCursor`)— porque el
// motor de la app importa hasta 5 000 filas por fichero y 5 000 por
// sincronización: un CRM real llena la tabla.
//
// Con 5 000 deals, «¿qué deals tengo en Negociación?» manda 5 000 objetos al
// modelo en un paso: el turno se va en tokens, el modelo pierde el hilo y, si el
// proveedor corta por longitud, el usuario ve un error en vez de una lista. El
// contrato que falta es el de las otras listas: un tope, `total` con las filas
// que coinciden, `hasMore` y una nota que diga cuántas se enseñan de cuántas.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-business-caps-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

async function raw() {
  const { getDb } = await import("../db.server");
  return (await getDb()).raw;
}

async function seedDeals(count: number): Promise<void> {
  const db = await raw();
  db.run("DELETE FROM deals");
  const ins =
    "INSERT INTO deals (id,company,stage,value,owner,days_in_stage,status) VALUES (?,?,?,?,?,?,?)";
  for (let i = 1; i <= count; i += 1) {
    db.run(ins, [`d${i}`, `Empresa ${i}`, "Negociación", 1000 + i, "Ana", 3, "open"]);
  }
}

async function seedOverdueInvoices(count: number): Promise<void> {
  const db = await raw();
  db.run("DELETE FROM invoices");
  const ins =
    "INSERT INTO invoices (id,client,amount,due_date,status,reminders) VALUES (?,?,?,?,?,?)";
  for (let i = 1; i <= count; i += 1) {
    db.run(ins, [`i${i}`, `Cliente ${i}`, 500 + i, "2020-01-01", "open", 0]);
  }
}

type Executable = { execute: (input: unknown) => Promise<Record<string, unknown>> };
const exec = (t: unknown) => (t as Executable).execute;

async function businessTools() {
  const { createChatTools } = await import("./tools");
  return createChatTools({
    expert: { name: "General", sources: [] },
    expertId: "general",
    used: new Set<string>(),
    allowed: () => true,
    proposePending: async (_domain, title, risk, items) => ({
      eventId: "evt_test",
      title,
      risk,
      items,
      status: "pending" as const,
    }),
  });
}

describe("list_deals y list_overdue_invoices: recuento y tope", () => {
  it("no manda la tabla entera al modelo y dice cuántos deals hay", async () => {
    await seedDeals(250);
    const tools = await businessTools();

    const out = await exec(tools.list_deals)({});
    const deals = out["deals"] as unknown[];

    // 250 filas caben en la base; lo que no puede es viajar entero al contexto.
    expect(deals.length).toBeLessThan(250);
    expect(deals.length).toBeLessThanOrEqual(200);
    // Y lo que no se enseña se cuenta: `total` es el número que se cita.
    expect(out["total"]).toBe(250);
    expect(out["hasMore"]).toBe(true);
    expect(String(out["note"] ?? "")).toMatch(/250/);
  });

  it("no manda la tabla de facturas vencidas entera y dice cuántas son", async () => {
    await seedOverdueInvoices(250);
    const tools = await businessTools();

    const out = await exec(tools.list_overdue_invoices)({});
    const invoices = out["invoices"] as unknown[];

    expect(invoices.length).toBeLessThan(250);
    expect(invoices.length).toBeLessThanOrEqual(200);
    expect(out["total"]).toBe(250);
    expect(out["hasMore"]).toBe(true);
    expect(String(out["note"] ?? "")).toMatch(/250/);
  });

  it("con una tabla pequeña no recorta nada y el total coincide", async () => {
    await seedDeals(3);
    const tools = await businessTools();

    const out = await exec(tools.list_deals)({});
    const deals = out["deals"] as unknown[];

    expect(deals).toHaveLength(3);
    expect(out["total"]).toBe(3);
    expect(out["hasMore"]).not.toBe(true);
  });
});
