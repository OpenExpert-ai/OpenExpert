// SPDX-License-Identifier: MIT
// Las listas de negocio que quedan también dicen cuántas filas hay.
//
// T-0330 dio ese contrato a `list_deals` y `list_overdue_invoices` (tope de 200,
// `total`, `hasMore` y una nota con «Se listan N de M…»), pero dejó fuera las
// otras tres listas del catálogo: `get_campaign_performance` devuelve
// `ee.campaignPerformance()` entero, `get_churn_risk` devuelve `ee.churnRisk()`
// entero y el `stalled` de `get_pipeline_summary` es la lista de deals abiertos
// con más de 21 días en su etapa, también sin tope. Las tres leen la tabla con
// `select().from(...).all()` y la mandan tal cual.
//
// El tamaño no es teórico: el importador de CSV mete hasta 5 000 filas por
// fichero y cada conector hasta 5 000 por sincronización, así que un CRM real
// llena `campaigns` y `accounts`. Con 5 000 campañas, «¿cómo van las campañas?»
// manda 5 000 objetos al modelo en un paso: el turno se va en tokens y el
// proveedor lo corta por longitud, así que el usuario lee un error en vez de la
// lista. Lo que falta es el mismo contrato que ya cumplen las otras dos listas.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-lists-caps-"));
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

/** `count` campañas activas, con un CPA por encima de su objetivo. */
async function seedCampaigns(count: number): Promise<void> {
  const db = await raw();
  db.run("DELETE FROM campaigns");
  const ins =
    "INSERT INTO campaigns (id,name,channel,status,spend_7d,conversions_7d,cpa_target,daily_budget) VALUES (?,?,?,?,?,?,?,?)";
  for (let i = 1; i <= count; i += 1) {
    db.run(ins, [`c${i}`, `Campaña ${i}`, "Google Ads", "active", 1000 + i, 5, 50, 40]);
  }
}

/** `count` cuentas con riesgo de churn, para la lista de clientes. */
async function seedAccounts(count: number): Promise<void> {
  const db = await raw();
  db.run("DELETE FROM accounts");
  const ins =
    "INSERT INTO accounts (id,name,mrr,usage_trend,open_tickets,churn_risk) VALUES (?,?,?,?,?,?)";
  for (let i = 1; i <= count; i += 1) {
    db.run(ins, [`a${i}`, `Cuenta ${i}`, 500 + i, -0.2, 3, 0.6]);
  }
}

/** `count` deals abiertos estancados: 30 días en su etapa, por encima del umbral de 21. */
async function seedStalledDeals(count: number): Promise<void> {
  const db = await raw();
  db.run("DELETE FROM deals");
  const ins =
    "INSERT INTO deals (id,company,stage,value,owner,days_in_stage,status) VALUES (?,?,?,?,?,?,?)";
  for (let i = 1; i <= count; i += 1) {
    db.run(ins, [`s${i}`, `Empresa ${i}`, "Negociación", 1000 + i, "Ana", 30, "open"]);
  }
}

type Executable = { execute: (input: unknown) => Promise<Record<string, unknown>> };
const exec = (t: unknown) => (t as Executable).execute;

async function businessTools() {
  const { createChatTools } = await import("./ai/tools");
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

describe("campañas, cuentas y deals estancados: tope y recuento", () => {
  it("no manda la tabla de campañas entera y dice cuántas hay", async () => {
    await seedCampaigns(250);
    const tools = await businessTools();

    const out = await exec(tools.get_campaign_performance)({});
    const campaigns = out["campaigns"] as unknown[];

    // 250 filas caben en la base; lo que no puede es viajar entero al contexto.
    expect(campaigns.length).toBeLessThan(250);
    expect(campaigns.length).toBeLessThanOrEqual(200);
    // Y lo que no se enseña se cuenta: `total` es el número que se cita.
    expect(out["total"]).toBe(250);
    expect(out["hasMore"]).toBe(true);
    expect(String(out["note"] ?? "")).toMatch(/250/);
  });

  it("no manda la tabla de cuentas entera y dice cuántas hay", async () => {
    await seedAccounts(250);
    const tools = await businessTools();

    const out = await exec(tools.get_churn_risk)({});
    const accounts = out["accounts"] as unknown[];

    expect(accounts.length).toBeLessThan(250);
    expect(accounts.length).toBeLessThanOrEqual(200);
    expect(out["total"]).toBe(250);
    expect(out["hasMore"]).toBe(true);
    expect(String(out["note"] ?? "")).toMatch(/250/);
  });

  it("el resumen del pipeline no devuelve los deals estancados sin tope", async () => {
    await seedStalledDeals(250);
    const tools = await businessTools();

    const out = await exec(tools.get_pipeline_summary)({});
    const stalled = out["stalled"] as unknown[];

    expect(stalled.length).toBeLessThan(250);
    expect(stalled.length).toBeLessThanOrEqual(200);
    // El recorte no puede ser silencioso: el total tiene que viajar con la lista.
    expect(String(out["stalledTotal"] ?? out["note"] ?? "")).toMatch(/250/);
  });

  it("con una tabla pequeña no recorta nada y el total coincide", async () => {
    await seedCampaigns(3);
    const tools = await businessTools();

    const out = await exec(tools.get_campaign_performance)({});
    const campaigns = out["campaigns"] as unknown[];

    expect(campaigns).toHaveLength(3);
    expect(out["total"]).toBe(3);
    expect(out["hasMore"]).not.toBe(true);
  });
});
