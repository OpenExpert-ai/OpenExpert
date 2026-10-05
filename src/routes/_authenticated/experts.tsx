// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Database, Layers, Pencil, Trash2 } from "lucide-react";
import { PageHeader, Modal, inputCls, btnPrimary, btnGhost } from "@/components/AppShell";
import { useAct, useUI, useWorkspace } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { createExpert, deleteExpert, updateExpert } from "@/lib/data.functions";
import { EXPERT_DOMAINS, EXPERT_DOMAIN_LABELS } from "@/lib/domains";
import { buttonVariants } from "@/components/ui/button";
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

export const Route = createFileRoute("/_authenticated/experts")({
  head: () => ({
    meta: [
      { title: "Experts — OpenExpert" },
      {
        name: "description",
        content: "Segmenta el conocimiento por departamento con aislamiento de contexto.",
      },
      { property: "og:title", content: "Experts — OpenExpert" },
      { property: "og:description", content: "Aislamiento de contexto por área de negocio." },
    ],
  }),
  component: ExpertsPage,
});

export function ExpertForm({
  expertId,
  initialName = "",
  initialDesc = "",
  initialDomains = [],
  initialSources = [],
  onDone,
}: {
  expertId?: string;
  initialName?: string;
  initialDesc?: string;
  initialDomains?: string[];
  initialSources?: string[];
  onDone: (id: string) => void;
}) {
  const { data: ws } = useWorkspace();
  const { t } = useT();
  const create = useAct(createExpert, t("Experto creado"));
  const update = useAct(updateExpert, t("Experto actualizado"));
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);
  const [srcs, setSrcs] = useState<string[]>(initialSources);
  const [domains, setDomains] = useState<string[]>(initialDomains);
  if (!ws) return null;
  const pending = create.isPending || update.isPending;
  const save = () => {
    const payload = { name, description: desc, sources: srcs, domains };
    if (expertId) {
      update.mutate({ data: { id: expertId, ...payload } }, { onSuccess: () => onDone(expertId) });
    } else {
      create.mutate({ data: payload }, { onSuccess: (r) => onDone(r.id) });
    }
  };
  return (
    <div className="space-y-4">
      <input
        className={inputCls}
        placeholder={t("Nombre (p. ej. Operaciones)")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
      />
      <textarea
        className={inputCls}
        placeholder={t("Descripción y alcance")}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        maxLength={400}
      />
      <div>
        <div className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">
          {t("Dominios de datos")}
        </div>
        <div className="flex flex-wrap gap-2">
          {EXPERT_DOMAINS.map((d) => (
            <button
              type="button"
              key={d}
              onClick={() =>
                setDomains((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))
              }
              aria-pressed={domains.includes(d)}
              className={`rounded-full border px-3 py-1 text-xs ${domains.includes(d) ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
            >
              {t(EXPERT_DOMAIN_LABELS[d])}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "Determina qué datos de negocio puede consultar. Sin dominios, el Experto solo puede chatear y usar Drive.",
          )}
        </p>
      </div>
      <div>
        <div className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">
          {t("Integraciones conectadas")}
        </div>
        <div className="flex flex-wrap gap-2">
          {ws.integrations.map((i) => (
            <button
              type="button"
              key={i.id}
              onClick={() =>
                setSrcs((x) => (x.includes(i.id) ? x.filter((y) => y !== i.id) : [...x, i.id]))
              }
              aria-pressed={srcs.includes(i.id)}
              className={`rounded-full border px-3 py-1 text-xs ${srcs.includes(i.id) ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
            >
              {i.name}
              {!i.connected && ` · ${t("off")}`}
            </button>
          ))}
        </div>
      </div>
      <button className={btnPrimary} disabled={!name.trim() || pending} onClick={save}>
        {pending ? t("Guardando") : expertId ? t("Guardar cambios") : t("Crear Experto")}
      </button>
    </div>
  );
}

function ExpertsPage() {
  const { data: ws } = useWorkspace();
  const { activeExpert, setActiveExpert } = useUI();
  const { t } = useT();
  const remove = useAct(deleteExpert, t("Experto eliminado"));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  if (!ws) return null;
  const editTarget = ws.experts.find((e) => e.id === editing) ?? null;
  const confirmRemove = () => {
    const id = toDelete;
    if (!id) return;
    remove.mutate(
      { data: { id } },
      {
        onSuccess: () => {
          if (activeExpert === id) setActiveExpert("general");
        },
      },
    );
    setToDelete(null);
  };
  return (
    <div>
      <PageHeader
        eyebrow={t("Aislamiento de contexto")}
        title={t("Experts")}
        desc={t("Cada Experto solo ve sus fuentes conectadas y responde dentro de su dominio.")}
      >
        <button onClick={() => setOpen(true)} className={`${btnPrimary} items-center gap-2`}>
          <Plus className="h-4 w-4" /> {t("Nuevo Experto")}
        </button>
      </PageHeader>
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        {ws.experts.map((e) => (
          <div
            key={e.id}
            className={`rounded-lg border bg-card p-5 ${activeExpert === e.id ? "border-primary/50" : "border-border"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] text-muted-foreground">expert::{e.id}</div>
                <h3 className="font-display text-2xl">{e.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <button
                  onClick={() => setActiveExpert(e.id)}
                  className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
                >
                  {activeExpert === e.id ? t("Activo") : t("Activar")}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(e.id)}
                    aria-label={t("Editar Experto")}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {e.id !== "general" && (
                    <button
                      onClick={() => setToDelete(e.id)}
                      aria-label={t("Eliminar Experto")}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <Layers className="h-3 w-3" /> {t("Dominios")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {e.domains.length === 0 && (
                <span className="text-xs text-muted-foreground">{t("Sin dominios")}</span>
              )}
              {e.domains.map((d) => (
                <span key={d} className="rounded border border-border px-2 py-0.5 text-xs">
                  {t(EXPERT_DOMAIN_LABELS[d as keyof typeof EXPERT_DOMAIN_LABELS] ?? d)}
                </span>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <Database className="h-3 w-3" /> {t("Fuentes")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {e.sources.length === 0 && (
                <span className="text-xs text-muted-foreground">{t("Sin fuentes")}</span>
              )}
              {e.sources.map((id) => {
                const i = ws.integrations.find((x) => x.id === id);
                return (
                  <span
                    key={id}
                    className={`rounded border px-2 py-0.5 text-xs ${i?.connected ? "border-border" : "border-destructive/40 text-destructive"}`}
                  >
                    {i?.name ?? id}
                    {!i?.connected && ` · ${t("off")}`}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t("Nuevo Experto")}>
        <ExpertForm onDone={() => setOpen(false)} />
        <button className={`${btnGhost} mt-3`} onClick={() => setOpen(false)}>
          {t("Cancelar")}
        </button>
      </Modal>
      <Modal
        open={editTarget !== null}
        onClose={() => setEditing(null)}
        title={t("Editar Experto")}
      >
        {editTarget && (
          <ExpertForm
            key={editTarget.id}
            expertId={editTarget.id}
            initialName={editTarget.name}
            initialDesc={editTarget.description}
            initialDomains={editTarget.domains}
            initialSources={editTarget.sources}
            onDone={() => setEditing(null)}
          />
        )}
        <button className={`${btnGhost} mt-3`} onClick={() => setEditing(null)}>
          {t("Cancelar")}
        </button>
      </Modal>
      <AlertDialog open={toDelete !== null} onOpenChange={(next) => !next && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("¿Eliminar este Experto?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Se borrarán sus conversaciones. Podrás revertir el Experto desde el Registro, pero no las conversaciones.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className={buttonVariants({ variant: "destructive" })}
            >
              {t("Eliminar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
