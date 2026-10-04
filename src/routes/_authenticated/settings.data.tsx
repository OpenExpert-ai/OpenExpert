// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Download, Loader2, Trash2, Upload } from "lucide-react";
import { btnGhost, btnPrimary, inputCls } from "@/components/AppShell";
import {
  clearChatHistory,
  getDataStats,
  importBackup,
  resetData,
  vacuumDb,
} from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/settings/data")({
  component: DataSettings,
});

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Card({
  title,
  desc,
  children,
  danger,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={`rounded-lg border bg-card p-6 ${danger ? "border-destructive/40" : "border-border"}`}
    >
      <h2 className="font-display text-xl">{title}</h2>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function DataSettings() {
  const get = useServerFn(getDataStats);
  const doImport = useServerFn(importBackup);
  const doClearChat = useServerFn(clearChatHistory);
  const doVacuum = useServerFn(vacuumDb);
  const doReset = useServerFn(resetData);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["data-stats"], queryFn: () => get() });

  const [busy, setBusy] = useState<string | null>(null);
  const [resetWord, setResetWord] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    await qc.invalidateQueries();
  };

  const onImport = async (file: File) => {
    setBusy("import");
    try {
      const content = await file.text();
      const r = await doImport({ data: { content } });
      toast.success(`Copia restaurada (${r.applied.join(", ")})`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Copia no válida");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onClearChat = async () => {
    if (!window.confirm("¿Borrar todo el historial de conversaciones?")) return;
    setBusy("chat");
    try {
      const r = await doClearChat();
      toast.success(`Historial borrado (${r.removed} mensajes)`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onVacuum = async () => {
    setBusy("vacuum");
    try {
      await doVacuum();
      toast.success("Base de datos compactada");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onReset = async () => {
    if (resetWord !== "BORRAR") return;
    setBusy("reset");
    try {
      await doReset();
      toast.success("Datos restaurados al estado inicial");
      setResetWord("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Card title="Estado" desc="Resumen de los datos que guarda tu instalación.">
        {data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ["Base de datos", bytes(data.dbSize)],
              ["Expertos", String(data.experts)],
              ["Procesos", String(data.processes)],
              ["Integraciones", String(data.integrations)],
              ["Eventos", String(data.activity)],
              ["Mensajes", String(data.chatMessages)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-border p-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {label}
                </div>
                <div className="mt-1 text-lg">{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        )}
      </Card>

      <Card
        title="Copia de seguridad"
        desc="Incluye la base de datos, la configuración y las credenciales locales."
      >
        <div className="flex flex-wrap gap-3">
          <a href="/api/backup" download className={`${btnPrimary} flex items-center gap-1.5`}>
            <Download className="h-4 w-4" /> Descargar copia
          </a>
          <label className={`${btnGhost} flex cursor-pointer items-center gap-1.5`}>
            {busy === "import" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Importar copia
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
              }}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Importar <strong>reemplaza</strong> los datos actuales. Se recomienda descargar una copia
          antes.
        </p>
      </Card>

      <Card title="Mantenimiento" desc="Operaciones rápidas sobre la base de datos.">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onVacuum}
            disabled={busy !== null}
            className={`${btnGhost} flex items-center gap-1.5`}
          >
            {busy === "vacuum" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Compactar (VACUUM)
          </button>
          <button
            onClick={onClearChat}
            disabled={busy !== null}
            className={`${btnGhost} flex items-center gap-1.5`}
          >
            {busy === "chat" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Borrar historial de chat
          </button>
        </div>
      </Card>

      <Card
        danger
        title="Zona de peligro"
        desc="Restaura la base de datos a su estado inicial con los datos de ejemplo. La configuración y las credenciales no se tocan."
      >
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>
            Escribe <code>BORRAR</code> para confirmar. Esta acción no se puede deshacer.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={resetWord}
            onChange={(e) => setResetWord(e.target.value)}
            className={`${inputCls} max-w-40`}
            placeholder="BORRAR"
          />
          <button
            onClick={onReset}
            disabled={busy !== null || resetWord !== "BORRAR"}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
          >
            {busy === "reset" ? "Restaurando…" : "Restaurar datos iniciales"}
          </button>
        </div>
      </Card>
    </div>
  );
}
