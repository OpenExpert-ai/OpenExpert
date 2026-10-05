// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { btnPrimary, inputCls } from "@/components/AppShell";
import { SettingsCard as Card, SettingsField as Field } from "@/components/ui/settings";
import { useT } from "@/lib/i18n";
import { getChatSettings, updateChatSettings } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/settings/chat")({
  component: ChatSettings,
});

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
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    setMaxSteps(data.maxSteps);
    setInjectionGuard(data.injectionGuard);
    setExtraPatterns(data.injectionExtraPatterns.join("\n"));
    setRetentionDays(data.retentionDays);
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
        bodyClassName="mt-5 space-y-5"
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
        bodyClassName="mt-5 space-y-5"
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
      </Card>

      <button onClick={onSave} disabled={busy} className={btnPrimary}>
        {busy ? t("Guardando…") : t("Guardar cambios")}
      </button>
    </div>
  );
}
