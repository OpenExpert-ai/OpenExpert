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
