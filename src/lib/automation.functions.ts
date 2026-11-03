// SPDX-License-Identifier: MIT
// The browser calls the check while the application is open; there is no
// background daemon. A deterministic activity ID makes retries and multiple
// windows harmless inside the local server.
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as schema from "../../drizzle/schema";
import { getDb, now, persist } from "./db.server";
import { overdueInvoices } from "./ee.server";

const KEY = "daily-overdue-report";

export const getDailyReport = createServerFn({ method: "GET" }).handler(async () => {
  const { orm } = await getDb();
  const row = orm.select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  return { enabled: row?.value === true };
});

export const setDailyReport = createServerFn({ method: "POST" })
  .validator((input) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    orm
      .insert(schema.settings)
      .values({ key: KEY, value: data.enabled, updatedAt: now() })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: data.enabled, updatedAt: now() },
      })
      .run();
    await persist();
    return { enabled: data.enabled };
  });

/** Check once per local day. Reports counts only and never changes an invoice. */
export const runDailyReport = createServerFn({ method: "POST" }).handler(async () => {
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
});
