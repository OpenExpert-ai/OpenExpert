// SPDX-License-Identifier: MIT
// La previsión del pipeline se pondera con una tabla de cuatro etapas en
// castellano y, para cualquier otra, con un 0,2 que no sale de ningún dato. Un
// CRM real trae sus propias etapas —Pipedrive guarda el nombre del usuario, el
// CSV escribe el texto tal cual, y un deal sin etapa llega como «Sin etapa»—,
// así que la cifra que la tarjeta del Experto pinta como «Previsión ponderada»
// era el resultado de multiplicar por un 20 % inventado. Una etapa sin
// probabilidad declarada no tiene probabilidad: lo que no se pondera se queda
// fuera de la previsión y se dice cuánto es.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-prevision-etapas-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

const INSERT =
  "INSERT INTO deals (id,company,stage,value,owner,days_in_stage,status) VALUES (?,?,?,?,?,?,?)";

async function seed(rows: [string, string, string, number, string][]): Promise<void> {
  const { getDb } = await import("./db.server");
  const db = (await getDb()).raw;
  db.run("DELETE FROM deals");
  for (const [id, company, stage, value, status] of rows) {
    db.run(INSERT, [id, company, stage, value, "x", 3, status]);
  }
}

describe("pipelineSummary con etapas fuera de la tabla de probabilidades", () => {
  it("no pondera con un 20 % inventado la etapa que no conoce, y dice cuánto queda fuera", async () => {
    await seed([
      ["d1", "A", "Negociación", 1000, "open"],
      ["d2", "B", "Contact made", 1000, "open"],
    ]);

    const ee = await import("./ee.server");
    const s = await ee.pipelineSummary();

    expect(s.openDeals).toBe(2);
    expect(s.openValue).toBe(2000);
    // Solo «Negociación» tiene probabilidad declarada: 1.000 × 0,7. Hoy la
    // etapa desconocida entra con 0,2 y la cifra sale 900.
    expect(s.forecast).toBe(700);
    expect(s).toMatchObject({ unweighted: { deals: 1, value: 1000 } });
  });

  it("una etapa vacía o sin nombre tampoco pondera", async () => {
    await seed([
      ["d1", "A", "Propuesta", 500, "open"],
      ["d2", "B", "Sin etapa", 300, "open"],
      ["d3", "C", "Etapa 12", 200, "open"],
    ]);

    const ee = await import("./ee.server");
    const s = await ee.pipelineSummary();

    expect(s.forecast).toBe(225);
    expect(s).toMatchObject({ unweighted: { deals: 2, value: 500 } });
  });

  it("con todas las etapas conocidas no queda nada fuera de la previsión", async () => {
    await seed([
      ["d1", "A", "Cualificación", 1000, "open"],
      ["d2", "B", "Demo", 400, "open"],
    ]);

    const ee = await import("./ee.server");
    const s = await ee.pipelineSummary();

    expect(s.forecast).toBe(200);
    expect(s).toMatchObject({ unweighted: { deals: 0, value: 0 } });
  });
});
