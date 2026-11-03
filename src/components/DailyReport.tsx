// SPDX-License-Identifier: MIT
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDailyReport, runDailyReport, setDailyReport } from "@/lib/automation.functions";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

/** The app has no background service: the report runs only with a window open. */
export function DailyReportRunner() {
  const run = useServerFn(runDailyReport);
  useEffect(() => {
    const check = () => {
      void run().catch(() => {});
    };
    check();
    const interval = window.setInterval(check, 60_000);
    return () => window.clearInterval(interval);
  }, [run]);
  return null;
}

export function DailyReportSettings() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const get = useServerFn(getDailyReport);
  const save = useServerFn(setDailyReport);
  const run = useServerFn(runDailyReport);
  const status = useQuery({ queryKey: ["daily-report"], queryFn: () => get() });
  const update = async (enabled: boolean) => {
    try {
      await save({ data: { enabled } });
      await queryClient.invalidateQueries({ queryKey: ["daily-report"] });
      if (enabled) await run();
    } catch {
      toast.error(t("No se pudo actualizar el informe diario."));
    }
  };
  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-3">
      <h2 className="font-medium">{t("Informe diario de facturas vencidas")}</h2>
      <p className="text-sm text-muted-foreground">
        {t(
          "Opcional. Una vez al día, mientras OpenExpert está abierto, cuenta las facturas vencidas locales y guarda el resultado en Actividad. No envía mensajes ni modifica facturas. Puede incluir datos de ejemplo.",
        )}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={status.data?.enabled ?? false}
          disabled={!status.data}
          onChange={(e) => void update(e.target.checked)}
        />
        {t("Activar informe diario")}
      </label>
    </section>
  );
}
