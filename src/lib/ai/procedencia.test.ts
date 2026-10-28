// SPDX-License-Identifier: MIT
// La procedencia de los datos de negocio no la decide un conector: quien
// importa su exportación de CSV tiene sus datos en la base local, y el
// asistente no puede decirle que la base está vacía y que los datos no son
// reales mientras le enseña las filas que acaba de importar.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-procedencia-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

async function buildTool(name: string) {
  const { createChatTools } = await import("./tools");
  const tools = createChatTools({
    expert: { name: "General", sources: ["gdrive", "local"] },
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
  return (
    tools as unknown as Record<
      string,
      { execute: (i: unknown) => Promise<Record<string, unknown>> }
    >
  )[name]!.execute;
}

type Row = import("../business-csv").ParsedBusinessRow;

async function importRows(rows: Row[]) {
  const { importBusinessRows } = await import("../business-import.server");
  await importBusinessRows(rows[0]!.entity, rows);
}

/** Lo que la nota no puede decir cuando la base tiene filas del usuario. */
const FALSA = /la base local está vacía|no son reales/i;

describe("procedencia de los datos de negocio importados", () => {
  it("una factura importada por CSV no se anuncia como una base vacía sin datos reales", async () => {
    await importRows([
      {
        entity: "invoices",
        data: {
          id: "csv-f1",
          client: "Acme",
          amount: 1000,
          dueDate: "2026-09-01",
          status: "open",
          reminders: 0,
        },
      },
    ]);
    const exec = await buildTool("list_overdue_invoices");
    const out = await exec({});

    // La fila está: el total es la prueba de que hay datos que enseñar.
    expect(out["total"]).toBe(1);
    const note = String(out["note"] ?? "");
    expect(note).not.toMatch(FALSA);
    // Y la nota dice de dónde vienen, que es lo que el contrato pide.
    expect(note).toMatch(/importad|local/i);
  });

  it("el resumen del pipeline tampoco llama falsos a los datos importados", async () => {
    await importRows([
      {
        entity: "deals",
        data: {
          id: "csv-d1",
          company: "Beta",
          stage: "Demo",
          value: 5000,
          owner: "Ana",
          daysInStage: 3,
          closeDate: "2026-12-01",
          status: "open",
        },
      },
    ]);
    const exec = await buildTool("get_pipeline_summary");
    const out = await exec({});

    expect(out["openDeals"]).toBe(1);
    expect(String(out["note"] ?? "")).not.toMatch(FALSA);
  });

  it("con la base vacía y sin conectores sí avisa de que no hay datos", async () => {
    const { getDb } = await import("../db.server");
    const { orm } = await getDb();
    const schema = await import("../../../drizzle/schema");
    orm.delete(schema.invoices).run();
    orm.delete(schema.deals).run();

    const exec = await buildTool("list_overdue_invoices");
    const out = await exec({});

    const note = String(out["note"] ?? "");
    expect(note).toMatch(/no hay|sin conexión|sin fuente/i);
    expect(note).not.toMatch(/importad/i);
  });

  it("las filas de ejemplo se anuncian como tales, no como datos del usuario", async () => {
    await importRows([
      {
        entity: "deals",
        data: {
          id: "demo-d1",
          company: "Demo SL",
          stage: "Propuesta",
          value: 1200,
          owner: "Demo",
          daysInStage: 1,
          closeDate: null,
          status: "open",
        },
      },
    ]);
    const exec = await buildTool("get_pipeline_summary");
    const out = await exec({});

    expect(out["openDeals"]).toBe(1);
    expect(String(out["note"] ?? "")).toMatch(/ejemplo|demo/i);
  });
});
