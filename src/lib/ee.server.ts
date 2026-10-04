// SPDX-License-Identifier: MIT
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isLocalMode, LOCAL_OWNER_ID } from "@/lib/opencore/mode";

export type Access = "none" | "read" | "exec";
export type Role = "ADMIN" | "INTERMEDIO" | "LECTOR";
export type SnapEntry = {
  table: string;
  pk: Record<string, string | number>;
  before: Record<string, unknown> | null;
};

const REVERTIBLE: Record<string, true> = {
  experts: true,
  expert_access: true,
  user_roles: true,
  integrations: true,
  processes: true,
  invoices: true,
  campaigns: true,
  invitations: true,
};
export const uid = (p = "evt") => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
/**
 * Owner account email. Documentation only — the real access gate lives in the
 * `handle_new_user` trigger, which reads the `app.owner_email` Postgres setting.
 * Kept here (from `ALLOWED_EMAIL`) for readability.
 */
export const ALLOWED_EMAIL = process.env["ALLOWED_EMAIL"] || "owner@example.com";

export async function getCtx(userId: string) {
  // Local edition: the single owner is ADMIN of everything.
  if (isLocalMode() || userId === LOCAL_OWNER_ID) {
    return {
      userId: LOCAL_OWNER_ID,
      role: "ADMIN" as Role,
      name: "Propietario local",
      access: {} as Record<string, Access>,
    };
  }
  const db = supabaseAdmin;
  const [{ data: role }, { data: prof }, { data: acc }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("*").eq("id", userId).maybeSingle(),
    db.from("expert_access").select("expert_id, access").eq("user_id", userId),
  ]);
  if (!prof) throw new Error("Acceso no autorizado");
  const access: Record<string, Access> = {};
  for (const a of acc ?? []) access[a.expert_id] = a.access as Access;
  return { userId, role: (role?.role ?? "LECTOR") as Role, name: prof?.name ?? "Usuario", access };
}
export type Ctx = Awaited<ReturnType<typeof getCtx>>;

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
export const canExec = (c: Ctx, expertId: string) =>
  c.role !== "LECTOR" && (c.role === "ADMIN" || c.access[expertId] === "exec");
export const canRead = (c: Ctx, expertId: string) =>
  c.role === "ADMIN" || (c.access[expertId] ?? "none") !== "none";

export async function snapshotRows(
  table: string,
  pkCols: string[],
  rows: Record<string, unknown>[],
): Promise<SnapEntry[]> {
  return rows.map((r) => ({
    table,
    pk: Object.fromEntries(pkCols.map((k) => [k, r[k] as string])),
    before: r,
  }));
}
export async function fetchRows(table: string, col: string, values: (string | number)[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin.from(table as any) as any)
    .select("*")
    .in(col, values);
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any[];
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
}) {
  const id = e.id ?? uid();
  const { error } = await supabaseAdmin
    .from("activity")
    .insert({ id, sources: [], duration_ms: 300, ...e, snapshot: (e.snapshot ?? null) as never });
  if (error) throw new Error(error.message);
  return id;
}

export async function revertSnapshot(entries: SnapEntry[]) {
  for (const s of [...entries].reverse()) {
    if (!REVERTIBLE[s.table]) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = supabaseAdmin.from(s.table as any) as any;
    if (s.before === null) {
      let q = t.delete();
      for (const [k, v] of Object.entries(s.pk)) q = q.eq(k, v);
      const { error } = await q;
      if (error) throw new Error(error.message);
    } else {
      const { error } = await t.upsert(s.before);
      if (error) throw new Error(error.message);
    }
  }
}

/* ---------- Business queries (used by AI tools) ---------- */
export async function pipelineSummary() {
  const { data } = await supabaseAdmin.from("deals").select("*");
  const deals = data ?? [];
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
      .filter((d) => d.days_in_stage > 21)
      .map((d) => ({
        company: d.company,
        stage: d.stage,
        value: Number(d.value),
        days: d.days_in_stage,
        owner: d.owner,
      })),
  };
}
export async function listDeals(stage: string | null) {
  let q = supabaseAdmin
    .from("deals")
    .select("company, stage, value, owner, days_in_stage, close_date, status")
    .eq("status", "open");
  if (stage) q = q.ilike("stage", stage);
  const { data } = await q.order("value", { ascending: false });
  return data ?? [];
}
export async function overdueInvoices(minAmount: number | null) {
  const { data } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("status", "overdue")
    .gte("amount", minAmount ?? 0)
    .order("amount", { ascending: false });
  const today = Date.now();
  return (data ?? []).map((i) => ({
    id: i.id,
    client: i.client,
    amount: Number(i.amount),
    daysOverdue: Math.round((today - new Date(i.due_date).getTime()) / 86400000),
    reminders: i.reminders,
  }));
}
export async function campaignPerformance() {
  const { data } = await supabaseAdmin
    .from("campaigns")
    .select("*")
    .order("spend_7d", { ascending: false });
  return (data ?? []).map((c) => {
    const cpa = c.conversions_7d ? Number(c.spend_7d) / c.conversions_7d : null;
    return {
      id: c.id,
      name: c.name,
      channel: c.channel,
      status: c.status,
      spend7d: Number(c.spend_7d),
      conversions7d: c.conversions_7d,
      cpa: cpa ? Math.round(cpa) : null,
      cpaTarget: Number(c.cpa_target),
      overTargetPct: cpa ? Math.round((cpa / Number(c.cpa_target) - 1) * 100) : null,
      dailyBudget: Number(c.daily_budget),
    };
  });
}
export async function churnRisk() {
  const { data } = await supabaseAdmin
    .from("accounts")
    .select("*")
    .order("churn_risk", { ascending: false });
  return (data ?? []).map((a) => ({
    name: a.name,
    mrr: Number(a.mrr),
    usageTrendPct: Math.round(Number(a.usage_trend) * 100),
    openTickets: a.open_tickets,
    risk: Number(a.churn_risk),
  }));
}

/* ---------- Pending actions ---------- */
export type PendingAction =
  | { kind: "invoice_reminders"; ids: string[] }
  | { kind: "pause_campaigns"; ids: string[] }
  | { kind: "run_process"; ids: string[] };

export async function executePending(
  action: PendingAction,
): Promise<{ snapshot: SnapEntry[]; summary: string; sources: string[] }> {
  if (action.kind === "invoice_reminders") {
    const rows = await fetchRows("invoices", "id", action.ids);
    const snap = await snapshotRows("invoices", ["id"], rows);
    for (const r of rows)
      await supabaseAdmin
        .from("invoices")
        .update({ reminders: Number(r.reminders) + 1 })
        .eq("id", r.id as string);
    return {
      snapshot: snap,
      summary: `Enviadas ${rows.length} reclamaciones de cobro (${rows.map((r) => r.client).join(", ")})`,
      sources: ["Holded", "Gmail"],
    };
  }
  if (action.kind === "pause_campaigns") {
    const rows = await fetchRows("campaigns", "id", action.ids);
    const snap = await snapshotRows("campaigns", ["id"], rows);
    await supabaseAdmin.from("campaigns").update({ status: "paused" }).in("id", action.ids);
    return {
      snapshot: snap,
      summary: `Pausadas ${rows.length} campañas: ${rows.map((r) => r.name).join(", ")}`,
      sources: ["Meta Ads"],
    };
  }
  const rows = await fetchRows("processes", "id", action.ids);
  const snap = await snapshotRows("processes", ["id"], rows);
  for (const r of rows)
    await supabaseAdmin
      .from("processes")
      .update({ runs: Number(r.runs) + 1, last_run: new Date().toISOString() })
      .eq("id", r.id as string);
  return {
    snapshot: snap,
    summary: `Ejecutado proceso ${rows.map((r) => r.name).join(", ")}`,
    sources: [],
  };
}
