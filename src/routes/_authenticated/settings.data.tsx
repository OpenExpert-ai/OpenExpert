// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Unlink,
  Upload,
} from "lucide-react";
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
import { pluralize } from "@/lib/translate";
import { formatBytes } from "@/lib/format";
import {
  clearChatHistory,
  exportEncryptedBackup,
  getDataStats,
  importBackup,
  resetData,
  vacuumDb,
} from "@/lib/settings.functions";
import { BUSINESS_COLUMNS, CSV_MAX_ROWS, type BusinessEntity } from "@/lib/business-csv";
import {
  clearDemo,
  getBusinessDataStatus,
  importBusinessCsv,
  loadDemo,
} from "@/lib/business.functions";
import {
  connectHolded,
  connectPipedrive,
  disconnectConnector,
  getConnectorStatus,
  syncConnector,
} from "@/lib/connectors.functions";

export const Route = createFileRoute("/_authenticated/settings/data")({
  component: DataSettings,
});

/** The envelope's keys, as the user reads them. */
function fileLabel(key: string, t: (text: string) => string): string {
  switch (key) {
    case "db":
      return t("Base de datos");
    case "config":
      return t("Configuración");
    case "secrets":
      return t("Secretos");
    case "credentials":
      return t("Credenciales de Drive");
    case "secretKey":
      return t("Clave local");
    case "driveGrants":
      return t("Concesiones del Picker");
    case "localRoots":
      return t("Carpetas locales");
    case "notion":
      return t("Notion");
    case "driveConsent":
      return t("Consentimiento de Drive");
    default:
      return key;
  }
}

const ENTITY_LABEL: Record<BusinessEntity, string> = {
  deals: "Ventas",
  invoices: "Facturas",
  campaigns: "Campañas",
  accounts: "Cuentas",
};

function DataSettings() {
  const get = useServerFn(getDataStats);
  const doImport = useServerFn(importBackup);
  const doExportEncrypted = useServerFn(exportEncryptedBackup);
  const doClearChat = useServerFn(clearChatHistory);
  const doVacuum = useServerFn(vacuumDb);
  const doReset = useServerFn(resetData);
  const getBusiness = useServerFn(getBusinessDataStatus);
  const doImportCsv = useServerFn(importBusinessCsv);
  const doLoadDemo = useServerFn(loadDemo);
  const doClearDemo = useServerFn(clearDemo);
  const getConnectors = useServerFn(getConnectorStatus);
  const doConnectPipedrive = useServerFn(connectPipedrive);
  const doConnectHolded = useServerFn(connectHolded);
  const doSyncConnector = useServerFn(syncConnector);
  const doDisconnect = useServerFn(disconnectConnector);
  const qc = useQueryClient();
  const { t, locale } = useT();
  const { data } = useQuery({ queryKey: ["data-stats"], queryFn: () => get() });
  const business = useQuery({ queryKey: ["business-data"], queryFn: () => getBusiness() });
  const connectors = useQuery({ queryKey: ["connectors"], queryFn: () => getConnectors() });

  const [busy, setBusy] = useState<string | null>(null);
  const [resetWord, setResetWord] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importWord, setImportWord] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [entity, setEntity] = useState<BusinessEntity>("deals");
  const [pipedriveToken, setPipedriveToken] = useState("");
  const [holdedKey, setHoldedKey] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    await qc.invalidateQueries();
  };

  const onImport = async (file: File) => {
    setBusy("import");
    try {
      const content = await file.text();
      const r = await doImport({
        data: backupPassphrase ? { content, passphrase: backupPassphrase } : { content },
      });
      toast.success(
        `${t("Copia restaurada")} (${r.applied.map((f) => fileLabel(f, t)).join(", ")})`,
      );
      // A bundle that could not bring everything says so: the integrations it
      // left behind would otherwise show up as "not connected" with no reason.
      if (r.missing.length)
        toast.warning(
          t("La copia no traía: {list}. Si los usabas, tendrás que configurarlos otra vez.", {
            list: r.missing.map((f) => fileLabel(f, t)).join(", "),
          }),
        );
      // The restore keeps the database it replaced, so an unwanted import can be undone by hand.
      if (r.backupPath)
        toast.message(t("Copia anterior guardada en {path}", { path: r.backupPath }));
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || t("Copia no válida"));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDownloadEncrypted = async () => {
    setBusy("backup");
    try {
      const r = await doExportEncrypted({ data: { passphrase: backupPassphrase } });
      const blob = new Blob([r.content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("Copia cifrada descargada"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onClearChat = async () => {
    setBusy("chat");
    try {
      const r = await doClearChat();
      toast.success(
        pluralize(
          locale,
          r.removed,
          "Historial borrado ({n} mensaje)",
          "Historial borrado ({n} mensajes)",
        ),
      );
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

  const onCsv = async (file: File) => {
    setBusy("csv");
    try {
      const content = await file.text();
      const r = await doImportCsv({ data: { entity, content } });
      const imported = r.inserted + r.updated;
      // Un fichero sin una sola fila buena no es una importación: anunciarla en
      // verde («Importados 0 registros») y solo después el error confunde.
      if (imported > 0) {
        toast.success(
          t("Importados {n} registros de {entity}", {
            n: imported,
            entity: t(ENTITY_LABEL[entity]),
          }),
        );
      }
      if (r.skipped > 0) {
        const first = r.errors[0];
        // `errors` es una muestra (el servidor manda 20 como mucho), así que el
        // recuento sale de `skipped`; con `errors.length` se callaban las demás.
        const notice = pluralize(
          locale,
          r.skipped,
          "{n} fila con error; la primera, línea {row}: {message}",
          "{n} filas con error; la primera, línea {row}: {message}",
          { row: first?.row ?? 0, message: first?.message ?? "" },
        );
        const shown = r.errors.length;
        toast.warning(
          shown > 0 && shown < r.skipped
            ? `${notice} ${t("Se detallan solo las {n} primeras.", { n: shown })}`
            : notice,
        );
      }
      if (r.omitted > 0) {
        // El tope no es una fila rota: es un bloque de la exportación que no se
        // llegó a leer, y el usuario tiene que saber cuántas se quedaron fuera.
        toast.warning(
          pluralize(
            locale,
            r.omitted,
            "{n} fila no se importó: el tope es de {max} filas por importación.",
            "{n} filas no se importaron: el tope es de {max} filas por importación.",
            { max: CSV_MAX_ROWS },
          ),
        );
      }
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || t("CSV no válido"));
    } finally {
      setBusy(null);
      if (csvRef.current) csvRef.current.value = "";
    }
  };

  const onTemplate = () => {
    const blob = new Blob([`${BUSINESS_COLUMNS[entity].join(",")}\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plantilla-${entity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onDemo = async () => {
    setBusy("demo");
    try {
      if ((business.data?.demo ?? 0) > 0) {
        await doClearDemo();
        toast.success(t("Datos de ejemplo quitados"));
      } else {
        const r = await doLoadDemo();
        toast.success(t("Cargados {n} registros de ejemplo", { n: r.deals + r.invoices }));
      }
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // El aviso de una descarga cortada tiene que decirlo: con el tope de la
  // sincronización, un «N registros» a secas hace pasar un trozo por el total.
  const syncDone = (r: { inserted: number; updated: number; truncated: boolean }) => {
    const n = r.inserted + r.updated;
    return r.truncated
      ? t("Sincronizados {n} registros; la descarga se cortó en el tope y hay más sin traer", { n })
      : t("Sincronizados {n} registros", { n });
  };

  const onConnect = async (id: "pipedrive" | "holded") => {
    setBusy(`connect-${id}`);
    try {
      const r =
        id === "pipedrive"
          ? await doConnectPipedrive({ data: { token: pipedriveToken } })
          : await doConnectHolded({ data: { key: holdedKey } });
      toast.success(
        r.truncated
          ? t("Conectado: {n} registros; la descarga se cortó en el tope y hay más sin traer", {
              n: r.inserted + r.updated,
            })
          : t("Conectado: {n} registros", { n: r.inserted + r.updated }),
      );
      if (id === "pipedrive") setPipedriveToken("");
      else setHoldedKey("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onSync = async (id: "pipedrive" | "holded") => {
    setBusy(`sync-${id}`);
    try {
      const r = await doSyncConnector({ data: { id } });
      toast.success(syncDone(r));
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onDisconnect = async (id: "pipedrive" | "holded") => {
    setBusy(`disconnect-${id}`);
    try {
      await doDisconnect({ data: { id } });
      toast.success(t("Desconectado"));
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
        title={t("Datos de negocio")}
        desc={t("Importa un CSV o carga un juego de ejemplo para probar el panel.")}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("Tipo de datos")}
              <select
                className={`${inputCls} max-w-[12rem]`}
                value={entity}
                onChange={(e) => setEntity(e.target.value as BusinessEntity)}
              >
                {(Object.keys(ENTITY_LABEL) as BusinessEntity[]).map((id) => (
                  <option key={id} value={id}>
                    {t(ENTITY_LABEL[id])}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${btnGhost} cursor-pointer items-center gap-1.5`}>
              <FileSpreadsheet className="h-4 w-4" />
              {t("Importar CSV")}
              <input
                ref={csvRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onCsv(f);
                }}
              />
            </label>
            <button
              type="button"
              className={`${btnGhost} items-center gap-1.5`}
              onClick={onTemplate}
            >
              <Download className="h-4 w-4" />
              {t("Plantilla")}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "La plantilla trae las cabeceras que entiende el importador; también acepta una exportación con nombres equivalentes en español o inglés.",
            )}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {business.data ? (
              <>
                <span>
                  {t("Ventas")}: {business.data.deals}
                </span>
                <span>
                  {t("Facturas")}: {business.data.invoices}
                </span>
                <span>
                  {t("Campañas")}: {business.data.campaigns}
                </span>
                <span>
                  {t("Cuentas")}: {business.data.accounts}
                </span>
                {business.data.demo > 0 ? (
                  <span className="text-amber-500">
                    {t("De ejemplo: {n}", { n: business.data.demo })}
                  </span>
                ) : null}
              </>
            ) : (
              <span>{t("Cargando…")}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={`${btnPrimary} items-center gap-1.5`}
              disabled={busy !== null}
              onClick={() => void onDemo()}
            >
              <Sparkles className="h-4 w-4" />
              {business.data?.demo ? t("Quitar datos de ejemplo") : t("Cargar datos de ejemplo")}
            </button>
            <p className="text-xs text-muted-foreground">
              {t("Los datos de ejemplo se marcan como demo y se quitan sin tocar los reales.")}
            </p>
          </div>
        </div>
      </Card>

      <Card
        title={t("Conectores de negocio")}
        desc={t(
          "Opcionales. Se conectan con tu clave y solo leen; los datos se quedan en tu equipo.",
        )}
      >
        <div className="space-y-4">
          {(["pipedrive", "holded"] as const).map((id) => {
            const current = connectors.data?.find((c) => c.id === id);
            const connected = current?.connected ?? false;
            const configured = current?.configured ?? false;
            const value = id === "pipedrive" ? pipedriveToken : holdedKey;
            const label = id === "pipedrive" ? "Pipedrive" : "Holded";
            const placeholder =
              id === "pipedrive" ? t("API token de Pipedrive") : t("API key de Holded");
            return (
              <div key={id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      {connected ? t("Conectado") : t("Sin conectar")}
                      {current?.lastSync
                        ? ` · ${t("Última sync: {date}", {
                            date: new Date(current.lastSync).toLocaleString(locale),
                          })}`
                        : ""}
                    </div>
                  </div>
                  {connected ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
                </div>
                {connected ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`${btnGhost} items-center gap-1.5`}
                      disabled={busy !== null}
                      onClick={() => void onSync(id)}
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t("Sincronizar")}
                    </button>
                    <button
                      type="button"
                      className={`${btnGhost} items-center gap-1.5`}
                      disabled={busy !== null}
                      onClick={() => void onDisconnect(id)}
                    >
                      <Unlink className="h-4 w-4" />
                      {t("Desconectar")}
                    </button>
                  </div>
                ) : configured ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={`${btnGhost} items-center gap-1.5`}
                      disabled={busy !== null}
                      onClick={() => void onSync(id)}
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t("Sincronizar")}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {t("Clave guardada; pulsa Sincronizar.")}
                    </span>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      type="password"
                      className={`${inputCls} min-w-[16rem] flex-1`}
                      placeholder={placeholder}
                      value={value}
                      onChange={(e) =>
                        id === "pipedrive"
                          ? setPipedriveToken(e.target.value)
                          : setHoldedKey(e.target.value)
                      }
                    />
                    <button
                      type="button"
                      className={`${btnPrimary} items-center gap-1.5`}
                      disabled={value.trim().length < 10 || busy !== null}
                      onClick={() => void onConnect(id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {t("Conectar y sincronizar")}
                    </button>
                  </div>
                )}
                {current?.entities?.length ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {current.entities.map((e) => `${e.name}: ${e.count}`).join(" · ")}
                  </p>
                ) : null}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            {t(
              "Las claves se guardan en secrets.json con permisos 0600; solo se leen datos del conector.",
            )}
          </p>
        </div>
      </Card>

      <Card
        title={t("Copia de seguridad")}
        desc={t(
          "Incluye la base de datos, la configuración, las credenciales locales y el estado de tus integraciones.",
        )}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[14rem] flex-col gap-1 text-xs text-muted-foreground">
            {t("Contraseña de la copia")}
            <input
              type="password"
              className={inputCls}
              value={backupPassphrase}
              placeholder={t("Mínimo 8 caracteres")}
              onChange={(e) => setBackupPassphrase(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${btnPrimary} items-center gap-1.5`}
            disabled={backupPassphrase.length < 8 || busy !== null}
            onClick={() => void onDownloadEncrypted()}
          >
            {busy === "backup" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t("Descargar cifrada")}
          </button>
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
              accept="application/json,.json,.enc"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setImportFile(f);
              }}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "La copia cifrada pide esta contraseña al restaurar; si la pierdes, no se puede abrir.",
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("Importar reemplaza los datos actuales. Se recomienda descargar una copia antes.")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            "La copia lleva la clave que descifra esas credenciales: quien tenga el fichero puede leer tus tokens. Guárdala como guardarías las credenciales.",
          )}
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
          "Restaura la base de datos a su estado inicial (vacía, sin datos de negocio). La configuración y las credenciales no se tocan.",
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
              {t("Se eliminarán todos los mensajes guardados. No afecta a tus Experts.")}
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
