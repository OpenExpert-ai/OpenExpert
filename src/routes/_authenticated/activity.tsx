// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, User, Undo2, Check, X, Search, ScrollText } from "lucide-react";
import { PageHeader, inputCls } from "@/components/AppShell";
import { useAct, useMe, useWorkspace, fmtTime } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { decideAction, revertEvent } from "@/lib/data.functions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  ok: "border-success/40 text-success",
  pending: "border-warning/40 text-warning",
  reverted: "text-muted-foreground line-through",
  denied: "border-destructive/40 text-destructive",
  failed: "border-destructive/40 text-destructive",
};

const STATUSES = ["ok", "pending", "reverted", "denied", "failed"] as const;
const PAGE = 40;

function ActivityPage() {
  const { data: ws } = useWorkspace();
  const me = useMe(ws);
  const { t, locale } = useT();
  const revert = useAct(revertEvent, t("Estado restaurado desde snapshot"));
  const decide = useAct(decideAction);
  const [actor, setActor] = useState("all");
  const [type, setType] = useState("all");
  const [expertFilter, setExpertFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [toRevert, setToRevert] = useState<string | null>(null);
  const types = useMemo(() => [...new Set(ws?.activity.map((a) => a.type) ?? [])], [ws]);
  if (!ws || !me) return null;

  const needle = q.trim().toLowerCase();
  const rows = ws.activity.filter(
    (a) =>
      (actor === "all" || a.actor === actor) &&
      (type === "all" || a.type === type) &&
      (expertFilter === "all" || a.expert_id === expertFilter) &&
      (status === "all" || a.status === status) &&
      (needle === "" ||
        `${a.summary} ${a.type} ${a.actor_name} ${a.id}`.toLowerCase().includes(needle)),
  );
  const visible = rows.slice(0, limit);
  const sel = inputCls + " w-auto py-1.5 text-xs";
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
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <label className="relative flex min-w-52 flex-1 items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <span className="sr-only">{t("Buscar en el registro…")}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Buscar en el registro…")}
            className={`${inputCls} py-1.5 pl-8 text-xs`}
          />
        </label>
        <label className="sr-only" htmlFor="activity-actor">
          {t("Todos los actores")}
        </label>
        <select
          id="activity-actor"
          className={sel}
          value={actor}
          onChange={(e) => setActor(e.target.value)}
        >
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
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(s)}
            </option>
          ))}
        </select>
        <span className="ml-auto self-center font-mono text-[0.7rem] text-muted-foreground">
          {t("{a} / {b} eventos", { a: rows.length, b: ws.activity.length })}
        </span>
      </div>
      <div className="divide-y divide-border">
        {visible.map((a) => (
          <div key={a.id} className="flex flex-wrap items-start gap-4 px-6 py-4 hover:bg-card/50">
            <div
              className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded border ${a.actor === "agent" ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}`}
            >
              {a.actor === "agent" ? <Bot className="size-4" /> : <User className="size-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium">{a.actor_name}</span>
                <span className="text-muted-foreground">· {a.type}</span>
                <span className="rounded border border-border px-1.5 font-mono text-[0.7rem]">
                  expert::{a.expert_id}
                </span>
                <Badge
                  variant="outline"
                  className={`font-mono text-[0.7rem] uppercase ${statusCls[a.status] ?? ""}`}
                >
                  {t(a.status)}
                </Badge>
              </div>
              <p className="mt-1 text-sm">{a.summary}</p>
              <div className="mt-1 flex flex-wrap gap-x-4 font-mono text-[0.7rem] text-muted-foreground">
                <span>{a.id}</span>
                <span>{fmtTime(a.ts, locale)}</span>
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
                <Button
                  size="sm"
                  disabled={!a.expert_id || !canDecide() || decide.isPending}
                  onClick={() => decide.mutate({ data: { eventId: a.id, approve: true } })}
                >
                  <Check data-icon="inline-start" /> {t("Aprobar")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!a.expert_id || !canDecide() || decide.isPending}
                  onClick={() => decide.mutate({ data: { eventId: a.id, approve: false } })}
                >
                  <X data-icon="inline-start" /> {t("Rechazar")}
                </Button>
              </div>
            )}
            {a.hasSnapshot && a.status === "ok" && (
              <Button
                size="sm"
                variant="outline"
                disabled={me.role !== "ADMIN" || revert.isPending}
                onClick={() => setToRevert(a.id)}
                title={me.role !== "ADMIN" ? t("Solo ADMIN") : undefined}
              >
                <Undo2 data-icon="inline-start" /> {t("Revertir")}
              </Button>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <Empty
            icon={ScrollText}
            title={needle ? t("No se encontraron eventos") : t("No hay eventos todavía.")}
            description={
              needle
                ? t("Sin resultados para «{q}».", { q })
                : t("Cuando converses con un Experto, aparecerá aquí.")
            }
          />
        )}
      </div>
      {rows.length > visible.length && (
        <div className="flex justify-center border-t border-border px-6 py-4">
          <button
            onClick={() => setLimit((n) => n + PAGE)}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("Cargar más")}
          </button>
        </div>
      )}
      <AlertDialog open={toRevert !== null} onOpenChange={(next) => !next && setToRevert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("¿Revertir {id}?", { id: toRevert ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Se restaurarán los datos al estado anterior almacenado en el snapshot.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                if (toRevert) revert.mutate({ data: { id: toRevert } });
                setToRevert(null);
              }}
            >
              {t("Revertir")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
