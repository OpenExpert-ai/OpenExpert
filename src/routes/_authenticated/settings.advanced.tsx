// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { btnGhost, btnPrimary, inputCls } from "@/components/AppShell";
import { SettingsCard as Card } from "@/components/ui/settings";
import { useT } from "@/lib/i18n";
import { getAdvanced, resetConfig, saveRawConfig } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/settings/advanced")({
  component: AdvancedSettings,
});

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const SOURCE_LABEL: Record<string, string> = {
  env: "entorno",
  file: "openexpert.json",
  secrets: "secrets.json",
  default: "por defecto",
};

function AdvancedSettings() {
  const get = useServerFn(getAdvanced);
  const save = useServerFn(saveRawConfig);
  const reset = useServerFn(resetConfig);
  const qc = useQueryClient();
  const { t } = useT();
  const { data } = useQuery({ queryKey: ["advanced"], queryFn: () => get() });

  const [content, setContent] = useState("");
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    setContent(data.raw);
  }, [data]);

  if (!data) {
    return (
      <div className="flex items-center gap-2 p-6 font-mono text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("Cargando…")}
      </div>
    );
  }

  const onSave = async () => {
    setBusy("save");
    try {
      await save({ data: { content } });
      toast.success(t("openexpert.json guardado"));
      loaded.current = false;
      await qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message || t("JSON inválido"));
    } finally {
      setBusy(null);
    }
  };

  const onReset = async () => {
    if (!window.confirm(t("¿Eliminar openexpert.json y volver a los valores por defecto?"))) return;
    setBusy("reset");
    try {
      await reset();
      toast.success(t("Configuración restaurada"));
      loaded.current = false;
      await qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const d = data.diagnostics;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Card title={t("Diagnóstico")} desc={t("Estado de tu instalación local.")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("Modelo")}
            </div>
            {d.provider}:{d.modelId}
          </div>
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("Google Drive")}
            </div>
            {d.googleConfigured ? t("Credenciales configuradas") : t("Sin credenciales OAuth")}
          </div>
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("Carpeta de datos")}
            </div>
            <code className="break-all text-xs">{d.dataDir}</code>{" "}
            {d.dataDirWritable ? `· ${t("escribible")}` : `· ${t("NO escribible")}`}
          </div>
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("Base de datos")}
            </div>
            <code className="break-all text-xs">{d.dbPath}</code> · {bytes(d.dbSize)}
          </div>
        </div>
      </Card>

      <Card
        title={t("Variables de entorno")}
        desc={t("Solo lectura. Las variables reales tienen prioridad.")}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-4">{t("Variable")}</th>
                <th className="py-2 pr-4">{t("Origen")}</th>
                <th className="py-2">{t("Valor")}</th>
              </tr>
            </thead>
            <tbody>
              {data.env.map((v) => (
                <tr key={v.name} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-mono text-xs">{v.name}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {v.set ? t(SOURCE_LABEL[v.source] ?? v.source) : "—"}
                  </td>
                  <td className="py-2 font-mono text-xs">
                    {v.secret ? (v.set ? "••••••" : "—") : (v.value ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="openexpert.json"
        desc={t("Edición directa del fichero. Se valida antes de guardar.")}
      >
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={16}
          spellCheck={false}
          className={`${inputCls} font-code text-xs`}
        />
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onSave}
            disabled={busy !== null}
            className={`${btnPrimary} flex items-center gap-1.5`}
          >
            {busy === "save" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("Guardar")}
          </button>
          <button
            onClick={onReset}
            disabled={busy !== null}
            className={`${btnGhost} flex items-center gap-1.5`}
          >
            {busy === "reset" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {t("Restaurar por defecto")}
          </button>
        </div>
      </Card>
    </div>
  );
}
