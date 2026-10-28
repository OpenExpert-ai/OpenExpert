// SPDX-License-Identifier: MIT
// Where the business rows come from.
//
// `connected` answered only half the question: whether an integration feeds the
// tables. The app has a second, real path that never goes through a connector —
// the CSV import on the Data page writes the same `deals`/`invoices`/
// `campaigns`/`accounts` rows the chat tools read —, so a tool that trusted the
// connector alone told the owner "the local database is empty, the data is not
// real" while handing back the very rows they had just imported.
//
// Provenance is read from the rows themselves: nothing, only the `demo-` sample
// rows the first-run seeder writes, or the owner's own data.
import { count, like } from "drizzle-orm";
import { getDb } from "./db.server";
import * as schema from "../../drizzle/schema";
import type { BusinessEntity } from "./business-csv";

/** Prefix the demo seeder writes so the owner can drop them without touching real rows. */
export const DEMO_ID_PREFIX = "demo-";

export type RowProvenance = "empty" | "demo" | "local";

/** One table per importable entity, the same four the importer writes. */
const TABLES = {
  deals: schema.deals,
  invoices: schema.invoices,
  campaigns: schema.campaigns,
  accounts: schema.accounts,
} as const;

type Orm = Awaited<ReturnType<typeof getDb>>["orm"];
type BusinessTable = (typeof TABLES)[BusinessEntity];

function countRows(orm: Orm, table: BusinessTable, demoOnly = false): number {
  const query = orm.select({ n: count() }).from(table);
  const rows = demoOnly ? query.where(like(table.id, `${DEMO_ID_PREFIX}%`)).all() : query.all();
  return rows[0]?.n ?? 0;
}

/**
 * Which kind of rows a table holds: `empty` (nothing to answer with), `demo`
 * (only sample rows) or `local` (at least one row the owner brought in).
 */
export async function rowProvenance(entity: BusinessEntity): Promise<RowProvenance> {
  const { orm } = await getDb();
  const table = TABLES[entity];
  const total = countRows(orm, table);
  if (total === 0) return "empty";
  return countRows(orm, table, true) === total ? "demo" : "local";
}

/**
 * Rows in every business table at once. The chat window asks one yes/no
 * question —"is there anything to query?"— and a bare count answers it without
 * shipping a single row.
 */
export async function businessRowCount(): Promise<number> {
  const { orm } = await getDb();
  let total = 0;
  for (const table of Object.values(TABLES)) total += countRows(orm, table);
  return total;
}

/**
 * True when every id is a sample row. An empty list is not "all demo": there is
 * nothing to attribute, and the caller decides what to say then.
 */
export function allDemoIds(ids: string[]): boolean {
  return ids.length > 0 && ids.every((id) => id.startsWith(DEMO_ID_PREFIX));
}
