// SPDX-License-Identifier: MIT
// Business core: audit log, revertible snapshots and the business queries
// used by the AI tools. Local SQLite, single owner (no RBAC).

import { z } from "zod";
import { daysSince } from "@/lib/calendar-day";
import { allDemoIds } from "@/lib/business-provenance.server";
import { DEAL_STATUS, INVOICE_STATUS } from "@/lib/business-status";
import { countPhrase } from "@/lib/translate";
import { getDb, now, persist } from "@/lib/db.server";
import * as schema from "../../drizzle/schema";

export type SnapEntry = {
  table: string;
  pk: Record<string, string | number>;
  before: Record<string, unknown> | null;
};

/** Tables whose changes can be reverted from the activity log. */
const REVERTIBLE: Record<string, true> = {
  experts: true,
  integrations: true,
  invoices: true,
  campaigns: true,
};

export const uid = (p = "evt") => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function snapshotRows(
  table: string,
  pkCols: string[],
  rows: Record<string, unknown>[],
): SnapEntry[] {
  return rows.map((r) => ({
    table,
    pk: Object.fromEntries(pkCols.map((k) => [k, r[k] as string])),
    before: r,
  }));
}

/** Select rows from `table` where `col` is in `values`. Internal use only. */
export async function fetchRows(
  table: string,
  col: string,
  values: (string | number)[],
): Promise<Record<string, unknown>[]> {
  if (!values.length) return [];
  const { raw } = await getDb();
  const placeholders = values.map(() => "?").join(",");
  const stmt = raw.prepare(`SELECT * FROM ${table} WHERE ${col} IN (${placeholders})`);
  stmt.bind(values as never);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>);
  stmt.free();
  return rows;
}

/**
 * Write a row in the activity log.
 *
 * `duration_ms` is the time the action really took, and only when it was
 * measured: most events are not timed at all (creating an Expert, saving a
 * setting, a Drive write). Those keep a null duration instead of a placeholder,
 * because a number nobody measured reads in the audit trail as a real one.
 */
export async function logActivity(e: {
  actor: "human" | "agent";
  actor_name: string;
  type: string;
  expert_id: string;
  status: string;
  summary: string;
  sources?: string[];
  duration_ms?: number | null;
  snapshot?: unknown;
  id?: string;
}): Promise<string> {
  const { orm } = await getDb();
  const id = e.id ?? uid();
  orm
    .insert(schema.activity)
    .values({
      id,
      ts: now(),
      actor: e.actor,
      actorName: e.actor_name,
      type: e.type,
      expertId: e.expert_id,
      status: e.status,
      summary: e.summary,
      sources: e.sources ?? [],
      durationMs: e.duration_ms ?? null,
      snapshot: (e.snapshot ?? null) as never,
    })
    .run();
  await persist();
  return id;
}

export async function revertSnapshot(entries: SnapEntry[]): Promise<void> {
  const { raw } = await getDb();
  for (const s of [...entries].reverse()) {
    if (!REVERTIBLE[s.table]) continue;
    const keys = Object.keys(s.pk);
    if (s.before === null) {
      raw.run(
        `DELETE FROM ${s.table} WHERE ${keys.map((k) => `${k}=?`).join(" AND ")}`,
        Object.values(s.pk) as never,
      );
      continue;
    }
    const cols = Object.entries(s.before);
    if (!cols.length) continue;
    // Restore only the columns captured in the snapshot so a partial row never
    // wipes untouched columns (regression: process toggle used to reset the
    // whole row via INSERT OR REPLACE).
    raw.run(
      `UPDATE ${s.table} SET ${cols.map(([c]) => `${c}=?`).join(", ")} WHERE ${keys
        .map((k) => `${k}=?`)
        .join(" AND ")}`,
      [...cols.map(([, v]) => v), ...keys.map((k) => s.pk[k])] as never,
    );
    // The row may have been deleted since the snapshot; recreate it then.
    if (raw.getRowsModified() === 0) {
      const before = Object.keys(s.before);
      raw.run(
        `INSERT OR REPLACE INTO ${s.table} (${before.join(",")}) VALUES (${before.map(() => "?").join(",")})`,
        before.map((c) => s.before?.[c]) as never,
      );
    }
  }
  await persist();
}

/* ---------- Business queries (used by AI tools) ---------- */

/**
 * Probabilidad declarada por etapa. Una etapa que no está aquí no tiene
 * probabilidad: no se pondera con un valor inventado, se queda fuera de la
 * previsión y se cuenta en `unweighted`.
 */
const STAGE_PROBABILITY: Record<string, number> = {
  Cualificación: 0.1,
  Demo: 0.25,
  Propuesta: 0.45,
  Negociación: 0.7,
};

export async function pipelineSummary() {
  const { orm } = await getDb();
  const deals = orm.select().from(schema.deals).all();
  const open = deals.filter((d) => d.status === DEAL_STATUS.open);
  const won = deals.filter((d) => d.status === DEAL_STATUS.won).length;
  const lost = deals.filter((d) => d.status === DEAL_STATUS.lost).length;
  const byStage: Record<string, { count: number; value: number }> = {};
  for (const d of open) {
    const s = (byStage[d.stage] ??= { count: 0, value: 0 });
    s.count++;
    s.value += Number(d.value);
  }
  // El conector de Pipedrive guarda el nombre de etapa del usuario y el
  // importador de CSV escribe el texto tal cual, así que las etapas del CRM no
  // son las cuatro de la tabla. Lo que no tiene probabilidad no se pondera —un
  // 20 % de la nada es una cifra inventada— y lo que queda fuera se dice.
  let forecast = 0;
  const unweighted = { deals: 0, value: 0 };
  for (const d of open) {
    const value = Number(d.value);
    const probability = Object.hasOwn(STAGE_PROBABILITY, d.stage)
      ? STAGE_PROBABILITY[d.stage]
      : undefined;
    if (probability === undefined) {
      unweighted.deals++;
      unweighted.value += value;
      continue;
    }
    forecast += value * probability;
  }
  return {
    openValue: open.reduce((a, d) => a + Number(d.value), 0),
    openDeals: open.length,
    winRate: won + lost ? won / (won + lost) : 0,
    forecast: Math.round(forecast),
    unweighted,
    byStage,
    stalled: open
      .filter((d) => d.daysInStage > 21)
      .map((d) => ({
        company: d.company,
        stage: d.stage,
        value: Number(d.value),
        days: d.daysInStage,
        owner: d.owner,
      })),
  };
}

export async function listDeals(stage: string | null) {
  const { orm } = await getDb();
  const rows = orm.select().from(schema.deals).all();
  return rows
    .filter(
      (d) =>
        d.status === DEAL_STATUS.open && (!stage || d.stage.toLowerCase() === stage.toLowerCase()),
    )
    .sort((a, b) => b.value - a.value)
    .map((d) => ({
      company: d.company,
      stage: d.stage,
      value: Number(d.value),
      owner: d.owner,
      days_in_stage: d.daysInStage,
      close_date: d.closeDate,
      status: d.status,
    }));
}

/**
 * Whether an invoice is past due.
 *
 * The explicit `status = "overdue"` is honoured as it always was, but no path in
 * the application writes it: the CSV importer defaults to `open`, the Holded
 * connector only knows `paid`, `cancelled` and `open`, and the demo data uses
 * `open`/`paid`. So the due date is what decides —an unpaid, non-cancelled
 * invoice whose day has passed— and a row marked by hand keeps being listed
 * even before its date, with zero days late.
 */
function isOverdue(invoice: { status: string; dueDate: string }, now: Date): boolean {
  if (invoice.status === INVOICE_STATUS.overdue) return true;
  if (invoice.status === INVOICE_STATUS.paid || invoice.status === INVOICE_STATUS.cancelled)
    return false;
  return daysSince(invoice.dueDate, now) > 0;
}

export async function overdueInvoices(minAmount: number | null) {
  const { orm } = await getDb();
  const today = new Date();
  return orm
    .select()
    .from(schema.invoices)
    .all()
    .filter((i) => isOverdue(i, today) && Number(i.amount) >= (minAmount ?? 0))
    .sort((a, b) => b.amount - a.amount)
    .map((i) => ({
      id: i.id,
      client: i.client,
      amount: Number(i.amount),
      daysOverdue: daysSince(i.dueDate, today),
      reminders: i.reminders,
    }));
}

export async function campaignPerformance() {
  const { orm } = await getDb();
  return orm
    .select()
    .from(schema.campaigns)
    .all()
    .sort((a, b) => b.spend7d - a.spend7d)
    .map((c) => {
      const cpa = c.conversions7d ? Number(c.spend7d) / c.conversions7d : null;
      const cpaTarget = Number(c.cpaTarget);
      return {
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        spend7d: Number(c.spend7d),
        conversions7d: c.conversions7d,
        // A CPA of 0 € is a CPA: only "no conversions" leaves it without value.
        cpa: cpa === null ? null : Math.round(cpa),
        cpaTarget,
        // cpa_target defaults to 0, which means "no goal declared": dividing by
        // it yielded Infinity and the campaign counted as over target.
        overTargetPct:
          cpa === null || cpaTarget <= 0 ? null : Math.round((cpa / cpaTarget - 1) * 100),
        dailyBudget: Number(c.dailyBudget),
      };
    });
}

export async function churnRisk() {
  const { orm } = await getDb();
  return orm
    .select()
    .from(schema.accounts)
    .all()
    .sort((a, b) => b.churnRisk - a.churnRisk)
    .map((a) => ({
      name: a.name,
      mrr: Number(a.mrr),
      usageTrendPct: Math.round(Number(a.usageTrend) * 100),
      openTickets: a.openTickets,
      risk: Number(a.churnRisk),
    }));
}

/* ---------- Pending actions ---------- */

export type PendingAction =
  { kind: "invoice_reminders"; ids: string[] } | { kind: "pause_campaigns"; ids: string[] };

/** Validates a pending action read back from an activity snapshot. */
export const pendingActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("invoice_reminders"), ids: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("pause_campaigns"), ids: z.array(z.string()).min(1) }),
]);

/** Concordancia de número en los textos de la actividad: «1 reclamación» / «2 reclamaciones». */
export { countPhrase };

/**
 * De dónde vienen las filas que una acción pendiente acaba de escribir.
 *
 * Las tablas de negocio no guardan su procedencia por fila, pero los datos de
 * ejemplo sí llevan prefijo `demo-`, y el resto es lo que el usuario tiene en su
 * equipo (importado por CSV o escrito por un conector, que ya no interviene en
 * la aprobación). Atribuir la reclamación a Holded porque el conector esté
 * conectado firmaba una fuente que no había tocado nada: la actividad de la
 * factura de un CSV leía «fuentes: Holded».
 */
function rowSource(rows: Record<string, unknown>[]): string {
  const ids = rows.map((r) => String(r["id"] ?? ""));
  return allDemoIds(ids) ? "Datos de ejemplo" : "Datos locales";
}

export async function executePending(
  action: PendingAction,
): Promise<{ snapshot: SnapEntry[]; summary: string; sources: string[] }> {
  const { raw } = await getDb();
  if (action.kind === "invoice_reminders") {
    const rows = await fetchRows("invoices", "id", action.ids);
    const snap = snapshotRows("invoices", ["id"], rows);
    for (const r of rows)
      raw.run("UPDATE invoices SET reminders = reminders + 1 WHERE id = ?", [r["id"] as string]);
    await persist();
    // Aprobar la reclamación solo la apunta en la factura: no hay envío de correo, así que
    // el resumen no puede decir «Enviadas» («enviada» se reserva para cuando exista un envío
    // real que devuelva ok) ni Gmail puede figurar como fuente si no ha intervenido.
    return {
      snapshot: snap,
      summary: `${countPhrase(rows.length, "reclamación de cobro registrada", "reclamaciones de cobro registradas")} (${rows.map((r) => r["client"]).join(", ")})`,
      sources: [rowSource(rows)],
    };
  }
  if (action.kind === "pause_campaigns") {
    const rows = await fetchRows("campaigns", "id", action.ids);
    const snap = snapshotRows("campaigns", ["id"], rows);
    for (const r of rows)
      raw.run("UPDATE campaigns SET status = 'paused' WHERE id = ?", [r["id"] as string]);
    await persist();
    return {
      snapshot: snap,
      summary: `${countPhrase(rows.length, "campaña pausada", "campañas pausadas")}: ${rows.map((r) => r["name"]).join(", ")}`,
      sources: [rowSource(rows)],
    };
  }
  const exhaustive: never = action;
  throw new Error(`Acción no soportada: ${JSON.stringify(exhaustive)}`);
}
