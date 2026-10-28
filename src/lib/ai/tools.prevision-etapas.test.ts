// SPDX-License-Identifier: MIT
// La previsión del pipeline no es el pipeline entero cuando hay etapas sin
// probabilidad declarada. El resumen ya devuelve `unweighted`, pero la cifra
// viaja al modelo por la ficha de la herramienta: si la nota no lo dice, el
// asistente cita la previsión como si cubriera todos los deals abiertos.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formatCurrency } from "@/lib/format";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-tools-prevision-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

const INSERT =
  "INSERT OR REPLACE INTO deals (id,company,stage,value,owner,days_in_stage,status) VALUES (?,?,?,?,?,?,?)";

async function seed(rows: [string, string, string, number, string][]): Promise<void> {
  const { getDb, persist } = await import("../db.server");
  const { raw } = await getDb();
  raw.run("DELETE FROM deals");
  for (const [id, company, stage, value, status] of rows) {
    raw.run(INSERT, [id, company, stage, value, "x", 3, status]);
  }
  await persist();
}

type Exec = (input: unknown) => Promise<Record<string, unknown>>;

async function pipeline(): Promise<Record<string, unknown>> {
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
  return (tools.get_pipeline_summary as unknown as { execute: Exec }).execute({});
}

describe("get_pipeline_summary cuando la previsión deja deals fuera", () => {
  it("la nota dice cuántos deals y cuánto valor no se ponderan", async () => {
    await seed([
      ["d1", "A", "Negociación", 1000, "open"],
      ["d2", "B", "Contact made", 1000, "open"],
    ]);

    const out = await pipeline();

    expect(out["forecast"]).toBe(700);
    expect(out["unweighted"]).toEqual({ deals: 1, value: 1000 });
    const note = String(out["note"]);
    // El importe se escribe con el formateador del proyecto: es-ES no agrupa
    // los millares de cuatro cifras («1000 €»), así que la cifra se compone.
    expect(note).toContain(`deja fuera 1 deal por ${formatCurrency(1000)} cuya etapa`);
    expect(note).toContain("no del pipeline entero");
  });

  it("con todas las etapas ponderadas no añade la nota", async () => {
    await seed([
      ["d1", "A", "Negociación", 1000, "open"],
      ["d2", "B", "Demo", 400, "open"],
    ]);

    const out = await pipeline();

    expect(out["forecast"]).toBe(800);
    expect(out["unweighted"]).toEqual({ deals: 0, value: 0 });
    // La nota de procedencia sigue su curso; la de la previsión no aparece.
    expect(String(out["note"] ?? "")).not.toContain("deja fuera");
  });
});
