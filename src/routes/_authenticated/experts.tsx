// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Database, Users as UsersIcon } from "lucide-react";
import { PageHeader, Modal, inputCls, btnPrimary, btnGhost } from "@/components/AppShell";
import { useAct, useMe, useUI, useWorkspace, type Access } from "@/lib/store";
import { createExpert } from "@/lib/data.functions";

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

const accessCls: Record<Access, string> = {
  exec: "text-success border-success/40",
  read: "text-info border-info/40",
  none: "text-muted-foreground/50 border-border",
};

export function ExpertForm({
  initialName = "",
  initialDesc = "",
  onDone,
}: {
  initialName?: string;
  initialDesc?: string;
  onDone: (id: string) => void;
}) {
  const { data: ws } = useWorkspace();
  const create = useAct(createExpert, "Experto creado");
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);
  const [srcs, setSrcs] = useState<string[]>([]);
  const [perm, setPerm] = useState<Record<string, Access>>({});
  if (!ws) return null;
  return (
    <div className="space-y-4">
      <input
        className={inputCls}
        placeholder="Nombre (p. ej. Operaciones)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
      />
      <textarea
        className={inputCls}
        placeholder="Descripción y alcance"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        maxLength={400}
      />
      <div>
        <div className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">
          Integraciones conectadas
        </div>
        <div className="flex flex-wrap gap-2">
          {ws.integrations.map((i) => (
            <button
              type="button"
              key={i.id}
              onClick={() =>
                setSrcs((x) => (x.includes(i.id) ? x.filter((y) => y !== i.id) : [...x, i.id]))
              }
              className={`rounded-full border px-3 py-1 text-xs ${srcs.includes(i.id) ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
            >
              {i.name}
              {!i.connected && " · off"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">
          Permisos iniciales
        </div>
        {ws.users.map((u) => (
          <div key={u.id} className="flex items-center justify-between py-1 text-sm">
            <span>
              {u.name} <span className="font-mono text-[10px] text-muted-foreground">{u.role}</span>
            </span>
            {u.role === "ADMIN" ? (
              <span className="font-mono text-[10px] text-success">EXEC</span>
            ) : (
              <select
                className="rounded border border-input bg-background px-2 py-1 text-xs"
                value={perm[u.id] ?? "none"}
                onChange={(e) => setPerm((p) => ({ ...p, [u.id]: e.target.value as Access }))}
              >
                <option value="none">none</option>
                <option value="read">read</option>
                {u.role !== "LECTOR" && <option value="exec">exec</option>}
              </select>
            )}
          </div>
        ))}
      </div>
      <button
        className={btnPrimary}
        disabled={!name.trim() || create.isPending}
        onClick={() =>
          create.mutate(
            { data: { name, description: desc, sources: srcs, perms: perm } },
            { onSuccess: (r) => onDone(r.id) },
          )
        }
      >
        {create.isPending ? "Creando…" : "Crear Experto"}
      </button>
    </div>
  );
}

function ExpertsPage() {
  const { data: ws } = useWorkspace();
  const me = useMe(ws);
  const { activeExpert, setActiveExpert } = useUI();
  const [open, setOpen] = useState(false);
  if (!ws || !me) return null;
  return (
    <div>
      <PageHeader
        eyebrow="Aislamiento de contexto"
        title="Experts"
        desc="Cada Experto solo ve sus fuentes conectadas y solo responde a los usuarios autorizados."
      >
        <button
          disabled={me.role !== "ADMIN"}
          onClick={() => setOpen(true)}
          className={`${btnPrimary} flex items-center gap-2`}
          title={me.role !== "ADMIN" ? "Solo ADMIN" : ""}
        >
          <Plus className="h-4 w-4" /> Nuevo Experto
        </button>
      </PageHeader>
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        {ws.experts.map((e) => {
          const mine = me.role === "ADMIN" || (me.access[e.id] ?? "none") !== "none";
          return (
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
                <button
                  disabled={!mine}
                  onClick={() => setActiveExpert(e.id)}
                  className="shrink-0 rounded border border-border px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  {!mine ? "Sin acceso" : activeExpert === e.id ? "Activo" : "Activar"}
                </button>
              </div>
              <div className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <Database className="h-3 w-3" /> Fuentes
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.sources.length === 0 && (
                  <span className="text-xs text-muted-foreground">Sin fuentes</span>
                )}
                {e.sources.map((id) => {
                  const i = ws.integrations.find((x) => x.id === id);
                  return (
                    <span
                      key={id}
                      className={`rounded border px-2 py-0.5 text-xs ${i?.connected ? "border-border" : "border-destructive/40 text-destructive"}`}
                    >
                      {i?.name ?? id}
                      {!i?.connected && " · off"}
                    </span>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <UsersIcon className="h-3 w-3" /> Matriz de acceso
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {ws.users.map((u) => {
                  const a = (u.access[e.id] ?? "none") as Access;
                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded bg-background/50 px-2 py-1 text-xs"
                    >
                      <span>{u.name}</span>
                      <span
                        className={`rounded border px-1.5 font-mono text-[10px] uppercase ${accessCls[a]}`}
                      >
                        {a}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo Experto">
        <ExpertForm onDone={() => setOpen(false)} />
        <button className={`${btnGhost} mt-3`} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </Modal>
    </div>
  );
}
