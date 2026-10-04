// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { btnGhost, btnPrimary, inputCls } from "@/components/AppShell";
import { getAdvanced, resetConfig, saveRawConfig } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/settings/advanced")({
  component: AdvancedSettings,
});

const SOURCE_LABEL: Record<string, string> = {
  env: "entorno",
  file: "openexpert.json",
  secrets: "secrets.json",
  default: "por defecto",
};

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Card({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="font-display text-xl">{title}</h2>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function AdvancedSettings() {
  const get = useServerFn(getAdvanced);
  const save = useServerFn(saveRawConfig);
  const reset = useServerFn(resetConfig);
  const qc = useQueryClient();
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
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }

  const onSave = async () => {
    setBusy("save");
    try {
      await save({ data: { content } });
      toast.success("openexpert.json guardado");
      loaded.current = false;
      await qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message || "JSON inválido");
    } finally {
      setBusy(null);
    }
  };

  const onReset = async () => {
    if (!window.confirm("¿Eliminar openexpert.json y volver a los valores por defecto?")) return;
    setBusy("reset");
    try {
      await reset();
      toast.success("Configuración restaurada");
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
      <Card title="Diagnóstico" desc="Estado de tu instalación local.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Modelo
            </div>
            {d.provider}:{d.modelId}
          </div>
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Google Drive
            </div>
            {d.googleConfigured ? "Credenciales configuradas" : "Sin credenciales OAuth"}
          </div>
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Carpeta de datos
            </div>
            <code className="break-all text-xs">{d.dataDir}</code>{" "}
            {d.dataDirWritable ? "· escribible" : "· NO escribible"}
          </div>
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Base de datos
            </div>
            <code className="break-all text-xs">{d.dbPath}</code> · {bytes(d.dbSize)}
          </div>
        </div>
      </Card>

      <Card
        title="Variables de entorno"
        desc="Solo lectura. Las variables reales tienen prioridad."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-4">Variable</th>
                <th className="py-2 pr-4">Origen</th>
                <th className="py-2">Valor</th>
              </tr>
            </thead>
            <tbody>
              {data.env.map((v) => (
                <tr key={v.name} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-mono text-xs">{v.name}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {v.set ? (SOURCE_LABEL[v.source] ?? v.source) : "—"}
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

      <Card title="openexpert.json" desc="Edición directa del fichero. Se valida antes de guardar.">
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
            Guardar
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
            Restaurar por defecto
          </button>
        </div>
      </Card>
    </div>
  );
}
