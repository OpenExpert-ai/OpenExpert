// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { Play, Zap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAct, useMe, useWorkspace, fmtTime } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { runProcess, toggleProcess } from "@/lib/data.functions";

export const Route = createFileRoute("/_authenticated/integrations/processes")({
  head: () => ({
    meta: [
      { title: "Procesos Autónomos — OpenExpert" },
      {
        name: "description",
        content: "Catálogo de agentes autónomos con disparadores, etapas y límites de seguridad.",
      },
      { property: "og:title", content: "Procesos Autónomos — OpenExpert" },
      {
        property: "og:description",
        content: "Leads B2B, facturas vencidas, pipeline, campañas y churn.",
      },
    ],
  }),
  component: ProcessesPage,
});

const apprCls: Record<string, string> = {
  Ninguna: "text-muted-foreground border-border",
  Requerida: "text-warning border-warning/40",
  "Doble firma": "text-destructive border-destructive/40",
};

function ProcessesPage() {
  const { data: ws } = useWorkspace();
  const me = useMe(ws);
  const { t, locale } = useT();
  const run = useAct(runProcess);
  const toggle = useAct(toggleProcess);
  if (!ws || !me) return null;
  return (
    <div className="grid gap-4 p-6 xl:grid-cols-2">
      {ws.processes.map((p) => (
        <div key={p.id} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {p.id} · expert::{p.expert_id}
              </div>
              <h3 className="font-display text-2xl">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
            </div>
            <button
              disabled={me.role !== "ADMIN" || toggle.isPending}
              onClick={() => toggle.mutate({ data: { id: p.id } })}
              className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${p.active ? "bg-primary" : "bg-muted"}`}
              aria-label={t("Activar proceso")}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all ${p.active ? "left-[18px]" : "left-0.5"}`}
              />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono">
              <Zap className="h-3 w-3 text-primary" />
              {p.trigger}
            </span>
            <span
              className={`flex items-center gap-1 rounded border px-2 py-0.5 font-mono ${apprCls[p.approval] ?? ""}`}
            >
              <ShieldCheck className="h-3 w-3" />
              {t("Aprobación: {v}", { v: p.approval })}
            </span>
          </div>
          <div className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("Arquitectura")}
          </div>
          <ol className="mt-2 flex flex-wrap items-center gap-1 text-xs">
            {p.stages.map((s, i) => (
              <li key={s} className="flex items-center gap-1">
                <span className="rounded bg-secondary px-2 py-1">
                  <span className="font-mono text-primary">{i + 1}</span> {s}
                </span>
                {i < p.stages.length - 1 && <span className="text-muted-foreground">→</span>}
              </li>
            ))}
          </ol>
          <div className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("Límites de seguridad")}
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {p.limits.map((l) => (
              <li key={l}>· {l}</li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="font-mono text-[10px] text-muted-foreground">
              {t("{n} ejecuciones · última {t}", {
                n: p.runs,
                t: p.last_run ? fmtTime(p.last_run, locale) : "—",
              })}
            </span>
            <button
              disabled={!p.active || run.isPending}
              onClick={() =>
                run.mutate(
                  { data: { id: p.id } },
                  {
                    onSuccess: (r) =>
                      toast.success(
                        r.pending
                          ? t("Solicitud enviada: pendiente de aprobación en el Registro")
                          : t("{name} ejecutado", { name: p.name }),
                      ),
                  },
                )
              }
              className="flex items-center gap-1.5 rounded-md border border-primary/50 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-30"
            >
              <Play className="h-3 w-3" /> {t("Ejecutar ahora")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
