// SPDX-License-Identifier: MIT
// Business core: audit log, revertible snapshots and the business queries
// used by the AI tools. Local SQLite, single owner (no RBAC).

import { z } from "zod";
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
  processes: true,
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

export async function logActivity(e: {
  actor: "human" | "agent";
  actor_name: string;
  type: string;
  expert_id: string;
  status: string;
  summary: string;
  sources?: string[];
  duration_ms?: number;
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
      durationMs: e.duration_ms ?? 300,
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

export async function pipelineSummary() {
  const { orm } = await getDb();
  const deals = orm.select().from(schema.deals).all();
  const open = deals.filter((d) => d.status === "open");
  const won = deals.filter((d) => d.status === "won").length;
  const lost = deals.filter((d) => d.status === "lost").length;
  const byStage: Record<string, { count: number; value: number }> = {};
  for (const d of open) {
    const s = (byStage[d.stage] ??= { count: 0, value: 0 });
    s.count++;
    s.value += Number(d.value);
  }
  const prob: Record<string, number> = {
    Cualificación: 0.1,
    Demo: 0.25,
    Propuesta: 0.45,
    Negociación: 0.7,
  };
  return {
    openValue: open.reduce((a, d) => a + Number(d.value), 0),
    openDeals: open.length,
    winRate: won + lost ? won / (won + lost) : 0,
    forecast: Math.round(open.reduce((a, d) => a + Number(d.value) * (prob[d.stage] ?? 0.2), 0)),
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
    .filter((d) => d.status === "open" && (!stage || d.stage.toLowerCase() === stage.toLowerCase()))
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

export async function overdueInvoices(minAmount: number | null) {
  const { orm } = await getDb();
  const today = Date.now();
  return orm
    .select()
    .from(schema.invoices)
    .all()
    .filter((i) => i.status === "overdue" && Number(i.amount) >= (minAmount ?? 0))
    .sort((a, b) => b.amount - a.amount)
    .map((i) => ({
      id: i.id,
      client: i.client,
      amount: Number(i.amount),
      daysOverdue: Math.round((today - new Date(i.dueDate).getTime()) / 86400000),
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
      return {
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        spend7d: Number(c.spend7d),
        conversions7d: c.conversions7d,
        cpa: cpa ? Math.round(cpa) : null,
        cpaTarget: Number(c.cpaTarget),
        overTargetPct: cpa ? Math.round((cpa / Number(c.cpaTarget) - 1) * 100) : null,
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
  | { kind: "invoice_reminders"; ids: string[] }
  | { kind: "pause_campaigns"; ids: string[] }
  | { kind: "run_process"; ids: string[] };

/** Validates a pending action read back from an activity snapshot. */
export const pendingActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("invoice_reminders"), ids: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("pause_campaigns"), ids: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("run_process"), ids: z.array(z.string()).min(1) }),
]);

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
    return {
      snapshot: snap,
      summary: `Enviadas ${rows.length} reclamaciones de cobro (${rows.map((r) => r["client"]).join(", ")})`,
      sources: ["Holded", "Gmail"],
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
      summary: `Pausadas ${rows.length} campañas: ${rows.map((r) => r["name"]).join(", ")}`,
      sources: ["Meta Ads"],
    };
  }
  if (action.kind === "run_process") {
    const rows = await fetchRows("processes", "id", action.ids);
    const snap = snapshotRows("processes", ["id"], rows);
    for (const r of rows)
      raw.run("UPDATE processes SET runs = runs + 1, last_run = ? WHERE id = ?", [
        now(),
        r["id"] as string,
      ]);
    await persist();
    return {
      snapshot: snap,
      summary: `Ejecutado proceso ${rows.map((r) => r["name"]).join(", ")}`,
      sources: [],
    };
  }
  const exhaustive: never = action;
  throw new Error(`Acción no soportada: ${JSON.stringify(exhaustive)}`);
}
