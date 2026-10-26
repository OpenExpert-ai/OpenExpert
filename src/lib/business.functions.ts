// SPDX-License-Identifier: MIT
// Data-in server functions: CSV import, demo rows and the counters the panel
// shows. The parsing is pure (`business-csv.ts`); this file only touches the
// database through the shared import path.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseBusinessCsv } from "./business-csv";
import { importBusinessRows } from "./business-import.server";
import { clearDemoData, loadDemoData } from "./demo-data.server";
import { getDb } from "./db.server";
import * as schema from "../../drizzle/schema";

const ENTITY = z.enum(["deals", "invoices", "campaigns", "accounts"]);

export const importBusinessCsv = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        entity: ENTITY,
        content: z.string().min(1).max(5_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const parsed = parseBusinessCsv(data.entity, data.content);
    if (parsed.rows.length === 0) {
      return {
        inserted: 0,
        updated: 0,
        skipped: parsed.errors.length,
        errors: parsed.errors.slice(0, 20),
      };
    }
    const counts = await importBusinessRows(data.entity, parsed.rows);
    return {
      ...counts,
      skipped: parsed.errors.length,
      errors: parsed.errors.slice(0, 20),
    };
  });

export const getBusinessDataStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { orm } = await getDb();
  const count = (rows: { id: string }[]) => rows.length;
  const demo = (rows: { id: string }[]) => rows.filter((r) => r.id.startsWith("demo-")).length;
  const deals = orm.select({ id: schema.deals.id }).from(schema.deals).all();
  const invoices = orm.select({ id: schema.invoices.id }).from(schema.invoices).all();
  const campaigns = orm.select({ id: schema.campaigns.id }).from(schema.campaigns).all();
  const accounts = orm.select({ id: schema.accounts.id }).from(schema.accounts).all();
  return {
    deals: count(deals),
    invoices: count(invoices),
    campaigns: count(campaigns),
    accounts: count(accounts),
    demo: demo(deals) + demo(invoices) + demo(campaigns) + demo(accounts),
  };
});

export const loadDemo = createServerFn({ method: "POST" }).handler(async () => {
  return loadDemoData();
});

export const clearDemo = createServerFn({ method: "POST" }).handler(async () => {
  await clearDemoData();
  return { ok: true };
});
