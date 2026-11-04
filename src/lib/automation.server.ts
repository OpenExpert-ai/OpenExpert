// SPDX-License-Identifier: MIT
// The daily overdue report, outside the server-function wrapper so the
// headless runner can call it without an HTTP request.
import { eq } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { getDb, now, persist } from "./db.server";
import { overdueInvoices } from "./ee.server";

const KEY = "daily-overdue-report";

/** Check once per local day. Reports counts only and never changes an invoice. */
export async function runDailyReportIfDue(): Promise<{ ran: boolean }> {
  const { orm, raw } = await getDb();
  const row = orm.select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  if (row?.value !== true) return { ran: false };
  const date = new Date();
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const id = `daily-overdue-report-${day}`;
  if (
    orm
      .select({ id: schema.activity.id })
      .from(schema.activity)
      .where(eq(schema.activity.id, id))
      .get()
  )
    return { ran: false };
  const invoices = await overdueInvoices(null);
  // Recheck after the await: another window may already have written this day.
  const enabled =
    orm.select().from(schema.settings).where(eq(schema.settings.key, KEY)).get()?.value === true;
  if (!enabled) return { ran: false };
  orm
    .insert(schema.activity)
    .values({
      id,
      ts: now(),
      actor: "agent",
      actorName: "Informe automático",
      type: "Informe",
      expertId: "general",
      status: "ok",
      summary: `Informe diario: ${invoices.length} factura(s) vencida(s) en los datos locales; pueden incluir datos de ejemplo.`,
      sources: ["Datos locales"],
    })
    .onConflictDoNothing()
    .run();
  if (raw.getRowsModified() === 0) return { ran: false };
  try {
    await persist();
  } catch (error) {
    // Allow a later check to retry if this report could not be saved.
    orm.delete(schema.activity).where(eq(schema.activity.id, id)).run();
    throw error;
  }
  return { ran: true };
}
