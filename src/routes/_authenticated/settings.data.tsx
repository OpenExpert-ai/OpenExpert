// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Download, Loader2, Trash2, Upload } from "lucide-react";
import { btnGhost, btnPrimary, inputCls } from "@/components/AppShell";
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
import { SettingsCard as Card } from "@/components/ui/settings";
import { useT } from "@/lib/i18n";
import { formatBytes } from "@/lib/format";
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

function DataSettings() {
  const get = useServerFn(getDataStats);
  const doImport = useServerFn(importBackup);
  const doClearChat = useServerFn(clearChatHistory);
  const doVacuum = useServerFn(vacuumDb);
  const doReset = useServerFn(resetData);
  const qc = useQueryClient();
  const { t } = useT();
  const { data } = useQuery({ queryKey: ["data-stats"], queryFn: () => get() });

  const [busy, setBusy] = useState<string | null>(null);
  const [resetWord, setResetWord] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importWord, setImportWord] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    await qc.invalidateQueries();
  };

  const onImport = async (file: File) => {
    setBusy("import");
    try {
      const content = await file.text();
      const r = await doImport({ data: { content } });
      toast.success(`${t("Copia restaurada")} (${r.applied.join(", ")})`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || t("Copia no válida"));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onClearChat = async () => {
    setBusy("chat");
    try {
      const r = await doClearChat();
      toast.success(t("Historial borrado ({n} mensajes)", { n: r.removed }));
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
      toast.success(t("Base de datos compactada"));
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
      toast.success(t("Datos restaurados al estado inicial"));
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
      <Card title={t("Estado")} desc={t("Resumen de los datos que guarda tu instalación.")}>
        {data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              [t("Base de datos"), formatBytes(data.dbSize)],
              [t("Experts"), String(data.experts)],
              [t("Procesos"), String(data.processes)],
              [t("Integraciones"), String(data.integrations)],
              [t("Eventos"), String(data.activity)],
              [t("Mensajes"), String(data.chatMessages)],
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
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Cargando…")}
          </div>
        )}
      </Card>

      <Card
        title={t("Copia de seguridad")}
        desc={t("Incluye la base de datos, la configuración y las credenciales locales.")}
      >
        <div className="flex flex-wrap gap-3">
          <a href="/api/backup" download className={`${btnPrimary} items-center gap-1.5`}>
            <Download className="h-4 w-4" /> {t("Descargar copia")}
          </a>
          <label className={`${btnGhost} cursor-pointer items-center gap-1.5`}>
            {busy === "import" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t("Importar copia")}
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setImportFile(f);
              }}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("Importar reemplaza los datos actuales. Se recomienda descargar una copia antes.")}
        </p>
      </Card>

      <Card title={t("Mantenimiento")} desc={t("Operaciones rápidas sobre la base de datos.")}>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onVacuum}
            disabled={busy !== null}
            className={`${btnGhost} items-center gap-1.5`}
          >
            {busy === "vacuum" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t("Compactar (VACUUM)")}
          </button>
          <button
            onClick={() => setClearOpen(true)}
            disabled={busy !== null}
            className={`${btnGhost} items-center gap-1.5`}
          >
            {busy === "chat" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {t("Borrar historial de chat")}
          </button>
        </div>
      </Card>

      <Card
        danger
        title={t("Zona de peligro")}
        desc={t(
          "Restaura la base de datos a su estado inicial con los datos de ejemplo. La configuración y las credenciales no se tocan.",
        )}
      >
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>
            {t("Escribe {word} para confirmar. Esta acción no se puede deshacer.", {
              word: "BORRAR",
            })}
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
            {busy === "reset" ? t("Restaurando…") : t("Restaurar datos iniciales")}
          </button>
        </div>
      </Card>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("¿Borrar todo el historial de conversaciones?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Se eliminarán todos los mensajes guardados. No afecta a Experts ni a procesos.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                setClearOpen(false);
                void onClearChat();
              }}
            >
              {t("Borrar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={importFile !== null}
        onOpenChange={(next) => {
          if (!next) {
            setImportFile(null);
            setImportWord("");
            if (fileRef.current) fileRef.current.value = "";
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Importar copia de seguridad")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Importar reemplaza los datos actuales y no se puede deshacer. Escribe {word} para confirmar.",
                { word: "IMPORTAR" },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            value={importWord}
            onChange={(e) => setImportWord(e.target.value)}
            className={inputCls}
            placeholder="IMPORTAR"
            aria-label={t("Escribir {word}", { word: "IMPORTAR" })}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={importWord !== "IMPORTAR" || busy !== null}
              onClick={() => {
                const f = importFile;
                setImportFile(null);
                setImportWord("");
                if (f) void onImport(f);
              }}
            >
              {t("Importar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
