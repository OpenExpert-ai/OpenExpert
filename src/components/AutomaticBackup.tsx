// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import {
  disableAutomaticBackup,
  enableAutomaticBackup,
  getAutomaticBackup,
  runAutomaticBackup,
} from "@/lib/automatic-backup.functions";
import { buttonVariants } from "@/components/ui/button";

export function AutomaticBackupRunner() {
  const run = useServerFn(runAutomaticBackup);
  const { t } = useT();
  const notified = useRef(false);
  useEffect(() => {
    const check = () => {
      void run()
        .then(() => {
          notified.current = false;
        })
        .catch(() => {
          if (!notified.current)
            toast.error(
              t("No se pudo crear la copia automática. Comprueba el espacio y los permisos."),
            );
          notified.current = true;
        });
    };
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, [run, t]);
  return null;
}

export function AutomaticBackupSettings() {
  const { t } = useT();
  const qc = useQueryClient();
  const get = useServerFn(getAutomaticBackup);
  const enable = useServerFn(enableAutomaticBackup);
  const disable = useServerFn(disableAutomaticBackup);
  const status = useQuery({
    queryKey: ["automatic-backup"],
    queryFn: () => get(),
    refetchInterval: 60_000,
  });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const change = async () => {
    setBusy(true);
    try {
      if (status.data?.active) await disable();
      else await enable({ data: { passphrase: password } });
      setPassword("");
    } catch {
      toast.error(t("No se pudo crear la copia automática. Comprueba el espacio y los permisos."));
    } finally {
      await qc.invalidateQueries({ queryKey: ["automatic-backup"] });
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-5">
      <h2 className="font-medium">{t("Copias automáticas cifradas")}</h2>
      <p className="text-sm text-muted-foreground">
        {t(
          "Crea una copia local al día mientras OpenExpert está abierto. La contraseña solo se mantiene en memoria y hay que activarlo de nuevo al reiniciar el servidor. Las copias no se eliminan automáticamente; conserva la contraseña para restaurarlas.",
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {t(
          "Si cambias la contraseña, se conserva la copia de hoy con su contraseña anterior; la nueva se usará para las siguientes.",
        )}
      </p>
      {status.data && (
        <p className="text-xs text-muted-foreground">
          {t("Carpeta de copias: {path}", { path: status.data.directory })}
        </p>
      )}
      {status.data?.lastError && (
        <p role="alert" className="text-sm text-destructive">
          {t(status.data.lastError)}
        </p>
      )}
      {!status.data?.active && (
        <label className="block text-sm">
          {t("Contraseña de las copias")}
          <input
            type="password"
            autoComplete="new-password"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={200}
          />
        </label>
      )}
      <button
        type="button"
        className={buttonVariants({ variant: status.data?.active ? "outline" : "default" })}
        disabled={!status.data || busy || (!status.data.active && password.length < 8)}
        onClick={() => void change()}
      >
        {status.data?.active ? t("Detener copias automáticas") : t("Activar copias automáticas")}
      </button>
    </section>
  );
}
