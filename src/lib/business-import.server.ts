// SPDX-License-Identifier: MIT
// Write parsed CSV rows into the business tables. One place owns the upsert so
// every importer (CSV today, a connector tomorrow) counts and audits the same
// way.
import { inArray } from "drizzle-orm";
import { getDb, persist } from "./db.server";
import * as ee from "./ee.server";
import * as schema from "../../drizzle/schema";
import type { BusinessEntity, ParsedBusinessRow } from "./business-csv";

export type ImportCounts = { inserted: number; updated: number; skipped: number };

/** Upsert every row and report how many were new. The id is the key. */
export async function importBusinessRows(
  entity: BusinessEntity,
  rows: ParsedBusinessRow[],
  source = "CSV",
): Promise<ImportCounts> {
  if (rows.length === 0) return { inserted: 0, updated: 0, skipped: 0 };
  const { orm } = await getDb();
  let inserted = 0;
  let updated = 0;

  if (entity === "deals") {
    const typed = rows.flatMap((r) => (r.entity === "deals" ? [r.data] : []));
    const existing = new Set(
      orm
        .select({ id: schema.deals.id })
        .from(schema.deals)
        .where(
          inArray(
            schema.deals.id,
            typed.map((r) => r.id),
          ),
        )
        .all()
        .map((r) => r.id),
    );
    for (const row of typed) {
      orm
        .insert(schema.deals)
        .values(row)
        .onConflictDoUpdate({ target: schema.deals.id, set: row })
        .run();
      if (existing.has(row.id)) updated++;
      else inserted++;
    }
  } else if (entity === "invoices") {
    const typed = rows.flatMap((r) => (r.entity === "invoices" ? [r.data] : []));
    const existing = new Set(
      orm
        .select({ id: schema.invoices.id })
        .from(schema.invoices)
        .where(
          inArray(
            schema.invoices.id,
            typed.map((r) => r.id),
          ),
        )
        .all()
        .map((r) => r.id),
    );
    for (const row of typed) {
      orm
        .insert(schema.invoices)
        .values(row)
        .onConflictDoUpdate({ target: schema.invoices.id, set: row })
        .run();
      if (existing.has(row.id)) updated++;
      else inserted++;
    }
  } else if (entity === "campaigns") {
    const typed = rows.flatMap((r) => (r.entity === "campaigns" ? [r.data] : []));
    const existing = new Set(
      orm
        .select({ id: schema.campaigns.id })
        .from(schema.campaigns)
        .where(
          inArray(
            schema.campaigns.id,
            typed.map((r) => r.id),
          ),
        )
        .all()
        .map((r) => r.id),
    );
    for (const row of typed) {
      orm
        .insert(schema.campaigns)
        .values(row)
        .onConflictDoUpdate({ target: schema.campaigns.id, set: row })
        .run();
      if (existing.has(row.id)) updated++;
      else inserted++;
    }
  } else {
    const typed = rows.flatMap((r) => (r.entity === "accounts" ? [r.data] : []));
    const existing = new Set(
      orm
        .select({ id: schema.accounts.id })
        .from(schema.accounts)
        .where(
          inArray(
            schema.accounts.id,
            typed.map((r) => r.id),
          ),
        )
        .all()
        .map((r) => r.id),
    );
    for (const row of typed) {
      orm
        .insert(schema.accounts)
        .values(row)
        .onConflictDoUpdate({ target: schema.accounts.id, set: row })
        .run();
      if (existing.has(row.id)) updated++;
      else inserted++;
    }
  }

  await persist();
  const total = inserted + updated;
  await ee.logActivity({
    actor: "human",
    actor_name: "Propietario local",
    type: "Importación",
    expert_id: "general",
    status: "ok",
    summary: `Importados ${total} registro(s) de ${entity} desde ${source}`,
    sources: [source],
  });
  return { inserted, updated, skipped: 0 };
}
