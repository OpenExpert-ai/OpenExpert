// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { btnPrimary, inputCls } from "@/components/AppShell";
import { useT } from "@/lib/i18n";
import { getChatSettings, updateChatSettings } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/settings/chat")({
  component: ChatSettings,
});

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
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function ChatSettings() {
  const get = useServerFn(getChatSettings);
  const save = useServerFn(updateChatSettings);
  const qc = useQueryClient();
  const { t } = useT();
  const { data } = useQuery({ queryKey: ["chat-settings"], queryFn: () => get() });

  const [maxSteps, setMaxSteps] = useState(50);
  const [injectionGuard, setInjectionGuard] = useState(true);
  const [extraPatterns, setExtraPatterns] = useState("");
  const [retentionDays, setRetentionDays] = useState(30);
  const [defaultApproval, setDefaultApproval] = useState<"Ninguna" | "Requerida">("Requerida");
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    setMaxSteps(data.maxSteps);
    setInjectionGuard(data.injectionGuard);
    setExtraPatterns(data.injectionExtraPatterns.join("\n"));
    setRetentionDays(data.retentionDays);
    setDefaultApproval(data.defaultApproval);
  }, [data]);

  if (!data) {
    return (
      <div className="flex items-center gap-2 p-6 font-mono text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("Cargando…")}
      </div>
    );
  }

  const onSave = async () => {
    setBusy(true);
    try {
      await save({
        data: {
          maxSteps,
          injectionGuard,
          injectionExtraPatterns: extraPatterns
            .split("\n")
            .map((p) => p.trim())
            .filter(Boolean),
          retentionDays,
          defaultApproval,
        },
      });
      toast.success(t("Ajustes de chat guardados"));
      loaded.current = false;
      await qc.invalidateQueries({ queryKey: ["chat-settings"] });
    } catch (e) {
      toast.error((e as Error).message || t("No se pudo guardar"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Card
        title={t("Seguridad del chat")}
        desc={t("La puerta de inyección bloquea intentos de evasión antes de llamar al modelo.")}
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={injectionGuard}
            onChange={(e) => setInjectionGuard(e.target.checked)}
            className="mt-1 h-4 w-4 accent-[var(--primary)]"
          />
          <span>
            <span className="block text-sm font-medium">{t("Activar guardia anti-inyección")}</span>
            <span className="block text-xs text-muted-foreground">
              {t(
                "Recomendado. Si se desactiva, los intentos de evasión no se bloquean ni se registran.",
              )}
            </span>
          </span>
        </label>

        <Field
          label={t("Patrones extra (uno por línea)")}
          hint={t(
            "Expresiones regulares adicionales. Se ignoran las inválidas; se rechazan al guardar.",
          )}
        >
          <textarea
            value={extraPatterns}
            onChange={(e) => setExtraPatterns(e.target.value)}
            rows={4}
            className={inputCls}
            placeholder={"revela (tus|las) instrucciones\nignore (your )?safety"}
          />
        </Field>
      </Card>

      <Card
        title={t("Comportamiento")}
        desc={t("Límites de ejecución y conservación de conversaciones.")}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("Máx. pasos por consulta")}
            hint={t("Número máximo de pasos con herramientas.")}
          >
            <input
              type="number"
              min={1}
              max={200}
              value={maxSteps}
              onChange={(e) => setMaxSteps(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label={t("Retención (días)")} hint={t("0 desactiva la purga automática.")}>
            <input
              type="number"
              min={0}
              max={3650}
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
        </div>
        <Field
          label={t("Aprobación por defecto")}
          hint={t("Política aplicada a los procesos nuevos.")}
        >
          <select
            value={defaultApproval}
            onChange={(e) => setDefaultApproval(e.target.value as "Ninguna" | "Requerida")}
            className={inputCls}
          >
            <option value="Requerida">{t("Requerida")}</option>
            <option value="Ninguna">{t("Ninguna")}</option>
          </select>
        </Field>
      </Card>

      <button onClick={onSave} disabled={busy} className={btnPrimary}>
        {busy ? t("Guardando…") : t("Guardar cambios")}
      </button>
    </div>
  );
}
