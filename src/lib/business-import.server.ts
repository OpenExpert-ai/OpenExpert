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

/** One table per importable entity: the four branches only pick a table. */
const IMPORT_TABLES = {
  deals: schema.deals,
  invoices: schema.invoices,
  campaigns: schema.campaigns,
  accounts: schema.accounts,
} as const;

type BusinessTable = (typeof IMPORT_TABLES)[BusinessEntity];
type Orm = Awaited<ReturnType<typeof getDb>>["orm"];

/** Rows the upsert writes, counted by row — never by how often an id shows up. */
type WriteCounts = { inserted: number; updated: number };

/**
 * Upsert `rows` and count what the statement really wrote.
 *
 * A file can carry the same id twice (two exports concatenated, an invoice
 * repeated): the first appearance inserts and the second updates the row the
 * first one just wrote. Counting against a snapshot taken before the loop said
 * "two inserted" over a table with one row, so the set of known ids grows as we
 * write and a repeated id is the update it is.
 */
function writeRows<T extends { id: string }>(
  rows: T[],
  alreadyStored: Set<string>,
  write: (row: T) => void,
): WriteCounts {
  const known = new Set(alreadyStored);
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    write(row);
    if (known.has(row.id)) {
      updated += 1;
    } else {
      inserted += 1;
      known.add(row.id);
    }
  }
  return { inserted, updated };
}

/** Ids of `table` that the database already had, out of the ids this batch carries. */
function storedIds(orm: Orm, table: BusinessTable, ids: string[]): Set<string> {
  return new Set(
    orm
      .select({ id: table.id })
      .from(table)
      .where(inArray(table.id, ids))
      .all()
      .map((r) => r.id),
  );
}

/** Upsert every row and report how many were new. The id is the key. */
export async function importBusinessRows(
  entity: BusinessEntity,
  rows: ParsedBusinessRow[],
  source = "CSV",
): Promise<ImportCounts> {
  if (rows.length === 0) return { inserted: 0, updated: 0, skipped: 0 };
  const { orm } = await getDb();

  const table = IMPORT_TABLES[entity];
  const typed = rows.flatMap((r) => (r.entity === entity ? [r.data] : []));
  const alreadyStored = storedIds(
    orm,
    table,
    typed.map((r) => r.id),
  );

  const counts = writeRows(typed, alreadyStored, (row) => {
    orm.insert(table).values(row).onConflictDoUpdate({ target: table.id, set: row }).run();
  });

  await persist();
  const total = counts.inserted + counts.updated;
  await ee.logActivity({
    actor: "human",
    actor_name: "Propietario local",
    type: "Importación",
    expert_id: "general",
    status: "ok",
    summary: `Importados ${total} registro(s) de ${entity} desde ${source}`,
    sources: [source],
  });
  return { inserted: counts.inserted, updated: counts.updated, skipped: 0 };
}
