// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, User, Undo2, Check, X } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { useAct, useMe, useWorkspace, fmtTime } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { decideAction, revertEvent } from "@/lib/data.functions";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Registro de Actividad — OpenExpert" },
      {
        name: "description",
        content: "Auditoría completa de acciones humanas y de agentes con reversión por snapshots.",
      },
      { property: "og:title", content: "Registro de Actividad — OpenExpert" },
      { property: "og:description", content: "Trazabilidad y reversión de cada acción." },
    ],
  }),
  component: ActivityPage,
});

const statusCls: Record<string, string> = {
  ok: "text-success border-success/40",
  pending: "text-warning border-warning/40",
  reverted: "text-muted-foreground border-border line-through",
  denied: "text-destructive border-destructive/40",
  failed: "text-destructive border-destructive/40",
};

function ActivityPage() {
  const { data: ws } = useWorkspace();
  const me = useMe(ws);
  const { t } = useT();
  const revert = useAct(revertEvent, t("Estado restaurado desde snapshot"));
  const decide = useAct(decideAction);
  const [actor, setActor] = useState("all");
  const [type, setType] = useState("all");
  const [expertFilter, setExpertFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const types = useMemo(() => [...new Set(ws?.activity.map((a) => a.type) ?? [])], [ws]);
  if (!ws || !me) return null;
  const rows = ws.activity.filter(
    (a) =>
      (actor === "all" || a.actor === actor) &&
      (type === "all" || a.type === type) &&
      (expertFilter === "all" || a.expert_id === expertFilter) &&
      (status === "all" || a.status === status),
  );
  const sel = "rounded-md border border-input bg-card px-2 py-1.5 text-xs";
  const canDecide = () => me.role === "ADMIN";

  return (
    <div>
      <PageHeader
        eyebrow={t("Auditoría")}
        title={t("Registro de Actividad")}
        desc={t(
          "Cada consulta, acción y cambio de configuración queda trazado. Los ADMIN pueden revertir acciones con snapshot; las acciones pendientes se aprueban aquí o en el chat.",
        )}
      />
      <div className="flex flex-wrap gap-2 border-b border-border px-6 py-3">
        <select className={sel} value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="all">{t("Todos los actores")}</option>
          <option value="human">{t("Humano")}</option>
          <option value="agent">{t("Agente")}</option>
        </select>
        <select className={sel} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">{t("Todos los tipos")}</option>
          {types.map((tp) => (
            <option key={tp}>{tp}</option>
          ))}
        </select>
        <select
          className={sel}
          value={expertFilter}
          onChange={(e) => setExpertFilter(e.target.value)}
        >
          <option value="all">{t("Todos los Experts")}</option>
          {ws.experts.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">{t("Todos los estados")}</option>
          {["ok", "pending", "reverted", "denied", "failed"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="ml-auto self-center font-mono text-[10px] text-muted-foreground">
          {t("{a} / {b} eventos", { a: rows.length, b: ws.activity.length })}
        </span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((a) => (
          <div key={a.id} className="flex flex-wrap items-start gap-4 px-6 py-4 hover:bg-card/50">
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border ${a.actor === "agent" ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}`}
            >
              {a.actor === "agent" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium">{a.actor_name}</span>
                <span className="text-muted-foreground">· {a.type}</span>
                <span className="rounded border border-border px-1.5 font-mono text-[10px]">
                  expert::{a.expert_id}
                </span>
                <span
                  className={`rounded border px-1.5 font-mono text-[10px] uppercase ${statusCls[a.status] ?? ""}`}
                >
                  {a.status}
                </span>
              </div>
              <p className="mt-1 text-sm">{a.summary}</p>
              <div className="mt-1 flex flex-wrap gap-x-4 font-mono text-[10px] text-muted-foreground">
                <span>{a.id}</span>
                <span>{fmtTime(a.ts)}</span>
                <span>{(a.duration_ms / 1000).toFixed(2)}s</span>
                {a.sources.length > 0 && (
                  <span>
                    {t("fuentes:")} {a.sources.join(", ")}
                  </span>
                )}
                {a.hasSnapshot && <span className="text-primary/80">snapshot ✓</span>}
              </div>
            </div>
            {a.status === "pending" && a.pending && (
              <div className="flex gap-2">
                <button
                  disabled={!a.expert_id || !canDecide() || decide.isPending}
                  onClick={() => decide.mutate({ data: { eventId: a.id, approve: true } })}
                  className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-30"
                >
                  <Check className="h-3 w-3" /> {t("Aprobar")}
                </button>
                <button
                  disabled={!a.expert_id || !canDecide() || decide.isPending}
                  onClick={() => decide.mutate({ data: { eventId: a.id, approve: false } })}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-30"
                >
                  <X className="h-3 w-3" /> {t("Rechazar")}
                </button>
              </div>
            )}
            {a.hasSnapshot && a.status === "ok" && (
              <button
                disabled={me.role !== "ADMIN" || revert.isPending}
                onClick={() => {
                  if (confirm(t("¿Revertir {id}?", { id: a.id })))
                    revert.mutate({ data: { id: a.id } });
                }}
                title={me.role !== "ADMIN" ? t("Solo ADMIN") : ""}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary disabled:opacity-30"
              >
                <Undo2 className="h-3 w-3" /> {t("Revertir")}
              </button>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            {t("Sin eventos para estos filtros.")}
          </div>
        )}
      </div>
    </div>
  );
}
