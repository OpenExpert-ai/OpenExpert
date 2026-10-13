// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-tools-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

async function buildTools() {
  const { createChatTools } = await import("./tools");
  return createChatTools({
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
}

type Parser = { parse: (v: unknown) => unknown };

describe("tolerant tool inputs", () => {
  it("coerces a numeric string and allows the filter to be omitted", async () => {
    const tools = await buildTools();
    const schema = tools.list_overdue_invoices.inputSchema as unknown as Parser;
    expect(schema.parse({ minAmount: "0" })).toEqual({ minAmount: 0 });
    expect(schema.parse({})).toEqual({ minAmount: undefined });
    expect(schema.parse({ minAmount: null })).toEqual({ minAmount: null });
  });

  it("accepts a single id string where an array is expected", async () => {
    const tools = await buildTools();
    const schema = tools.propose_invoice_reminders.inputSchema as unknown as Parser;
    expect(schema.parse({ invoiceIds: "inv-1" })).toEqual({ invoiceIds: "inv-1" });
  });
});

describe("provenance", () => {
  it("reports no connected source and no invented data", async () => {
    const tools = await buildTools();
    const exec = (
      tools.get_pipeline_summary as unknown as {
        execute: (input: unknown) => Promise<Record<string, unknown>>;
      }
    ).execute;
    const out = await exec({});
    expect(out["connected"]).toBe(false);
    expect(out["source"]).toBe("sin conexión");
    expect(typeof out["note"]).toBe("string");
    expect(out["openValue"]).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

type Executable = { execute: (input: unknown) => Promise<Record<string, unknown>> };
const exec = (t: unknown) => (t as Executable).execute;

/** Tools wired to an Expert with a given domain/source allow-list. */
async function buildExpert(domains: string[] = [], sources: string[] = []) {
  const { createChatTools } = await import("./tools");
  const used = new Set<string>();
  const proposals: { domain: string; title: string }[] = [];
  const tools = createChatTools({
    expert: { name: "Experto de prueba", sources },
    expertId: "experto-test",
    used,
    allowed: (domain) => domains.includes(domain),
    proposePending: async (domain, title, risk, items) => {
      proposals.push({ domain, title });
      return { eventId: "evt_test", title, risk, items, status: "pending" as const };
    },
  });
  return { tools, used, proposals };
}

describe("per-Expert domain isolation", () => {
  it("returns no data for a domain the Expert does not own", async () => {
    const { tools, used } = await buildExpert(["ventas"]);
    for (const tool of [
      tools.list_overdue_invoices,
      tools.get_campaign_performance,
      tools.get_churn_risk,
    ]) {
      const out = await exec(tool)({});
      expect(String(out["error"])).toMatch(/Fuera de contexto/);
    }
    const overdue = await exec(tools.list_overdue_invoices)({});
    expect(overdue["invoices"]).toBeUndefined();
    // A refused read must not be labelled as a source the Expert used.
    expect(used.has("Facturación")).toBe(false);
    expect(used.has("Publicidad")).toBe(false);
    expect(used.has("Clientes")).toBe(false);
  });

  it("returns data for an owned domain, but only there", async () => {
    const { tools, used } = await buildExpert(["finanzas"]);
    const invoices = await exec(tools.list_overdue_invoices)({});
    expect(Array.isArray(invoices["invoices"])).toBe(true);
    expect(used.has("Facturación")).toBe(true);

    const deals = await exec(tools.list_deals)({});
    expect(String(deals["error"])).toMatch(/Fuera de contexto/);
    expect(deals["deals"]).toBeUndefined();
  });

  it("does not even propose a write outside the owned domains", async () => {
    const { tools, proposals } = await buildExpert(["ventas"]);
    const out = await exec(tools.propose_invoice_reminders)({ invoiceIds: "inv-1" });
    expect(String(out["error"])).toMatch(/Fuera de contexto/);
    expect(proposals).toHaveLength(0);
  });

  it("proposes with pending status inside the owned domains", async () => {
    const { getDb, persist } = await import("../db.server");
    const { raw } = await getDb();
    raw.run(
      "INSERT OR REPLACE INTO integrations (id,name,category,connected,entities) VALUES (?,?,?,?,?)",
      ["holded", "Holded", "finanzas", 1, "[]"],
    );
    raw.run(
      "INSERT OR REPLACE INTO invoices (id,client,amount,due_date,status,reminders) VALUES (?,?,?,?,?,?)",
      ["inv-test", "Cliente Uno", 1200, "2026-01-01", "overdue", 0],
    );
    await persist();

    const { tools, proposals } = await buildExpert(["finanzas"]);
    const out = await exec(tools.propose_invoice_reminders)({ invoiceIds: ["inv-test"] });
    expect(out["status"]).toBe("pending");
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.domain).toBe("finanzas");
    expect(proposals[0]?.title).toMatch(/^Enviar 1 /);
  });
});

describe("source isolation", () => {
  it("denies a source the Expert does not list", async () => {
    const { tools, used } = await buildExpert(["ventas"], []);
    for (const [tool, input] of [
      [tools.search_drive, { query: "informe" }],
      [tools.list_local_files, {}],
      [tools.search_notion, { query: "informe" }],
    ] as const) {
      const out = await exec(tool)(input);
      expect(String(out["error"])).toMatch(/Fuera de contexto/);
    }
    expect(used.size).toBe(0);
  });

  it("reaches a listed source and labels it", async () => {
    const { tools, used } = await buildExpert(["ventas"], ["local"]);
    const out = await exec(tools.list_local_files)({});
    expect(Array.isArray(out["files"])).toBe(true);
    expect(used.has("Archivos locales")).toBe(true);

    const notion = await exec(tools.search_notion)({ query: "informe" });
    expect(String(notion["error"])).toMatch(/Fuera de contexto/);
  });
});
