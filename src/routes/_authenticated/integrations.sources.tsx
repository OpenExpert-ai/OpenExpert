// SPDX-License-Identifier: MIT
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUp, ChevronDown, FileText, Folder, FolderPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  acceptDriveConsent,
  addLocalRoot,
  browseLocalDir,
  disconnectDrive,
  disconnectNotion,
  getDriveAccessToken,
  getDriveConsent,
  getGrantedFiles,
  getLocalRoots,
  getNotionStatus,
  removeLocalRoot,
  setGrantedFiles,
  startDriveAuth,
  startNotionAuth,
  syncIntegration,
} from "@/lib/data.functions";
import { useAct, useDriveStatus, useWorkspace } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Modal, btnGhost, btnPrimary, inputCls } from "@/components/AppShell";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pickDriveFiles } from "@/lib/drive-picker";

export const Route = createFileRoute("/_authenticated/integrations/sources")({
  head: () => ({
    meta: [
      { title: "Fuentes de Datos — OpenExpert" },
      { name: "description", content: "Conecta archivos concretos de Google Drive vía Picker." },
      { property: "og:title", content: "Fuentes de Datos — OpenExpert" },
      {
        property: "og:description",
        content: "OpenExpert solo ve los archivos que tú elijas.",
      },
    ],
  }),
  component: SourcesPage,
});

const PICKER_KEY_HINT =
  "Configura GOOGLE_PICKER_API_KEY en el archivo de secretos para habilitar el Picker.";

function SourcesPage() {
  const { data: ws } = useWorkspace();
  const drive = useDriveStatus();
  const nav = useNavigate();
  const search = useSearch({ strict: false }) as { gdrive?: string; notion?: string };
  const { t } = useT();
  const qc = useQueryClient();
  const sync = useAct(syncIntegration, t("Google Drive sincronizado"));
  const disconnect = useAct(disconnectDrive, t("Google Drive desconectado"));
  const [open, setOpen] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);

  const consent = useQuery({
    queryKey: ["drive-consent"],
    queryFn: () => getDriveConsent(),
  });

  const granted = useQuery({
    queryKey: ["drive-grants"],
    queryFn: () => getGrantedFiles(),
  });

  const getRoots = useServerFn(getLocalRoots);
  const browseFn = useServerFn(browseLocalDir);
  const addRoot = useAct(addLocalRoot, t("Carpeta añadida"));
  const removeRoot = useAct(removeLocalRoot, t("Carpeta quitada"));
  const [localOpen, setLocalOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState<string | undefined>(undefined);
  const roots = useQuery({ queryKey: ["local-roots"], queryFn: () => getRoots() });
  const browse = useQuery({
    queryKey: ["browse-local", browsePath ?? "~"],
    queryFn: () => browseFn({ data: browsePath ? { path: browsePath } : {} }),
    enabled: localOpen,
    retry: false,
  });
  const refreshRoots = () => qc.invalidateQueries({ queryKey: ["local-roots"] });

  const getNotion = useServerFn(getNotionStatus);
  const startNotion = useServerFn(startNotionAuth);
  const disconnectNotionAct = useAct(disconnectNotion, t("Notion desconectado"));
  const notion = useQuery({ queryKey: ["notion-status"], queryFn: () => getNotion() });

  useEffect(() => {
    if (search.notion === "ok") {
      toast.success("Notion conectado.");
      nav({ search: {} as never });
      qc.invalidateQueries({ queryKey: ["notion-status"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
    } else if (search.notion) {
      toast.error(decodeURIComponent(search.notion));
      nav({ search: {} as never });
    }
  }, [search.notion, nav, qc]);

  useEffect(() => {
    if (search.gdrive === "ok") {
      toast.success("Google Drive conectado. Ahora selecciona archivos con el Picker.");
      nav({ search: {} as never });
    } else if (search.gdrive) {
      toast.error(decodeURIComponent(search.gdrive));
      nav({ search: {} as never });
    }
  }, [search.gdrive, nav]);

  if (!ws) return null;

  const onAcceptConsentAndConnect = async () => {
    try {
      await acceptDriveConsent();
      setConsentOpen(false);
      setConnecting(true);
      const { url } = await startDriveAuth();
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  };

  const onConnectNotion = async () => {
    try {
      const { url } = await startNotion();
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onPickFiles = async () => {
    if (!drive.data?.configured) {
      toast.error("Falta configurar el cliente OAuth en el servidor.");
      return;
    }
    setPickerLoading(true);
    try {
      const tokenAccess = await getDriveAccessToken();
      const apiKey = (window as unknown as { __OPENEXPERT_PICKER_KEY__?: string })
        .__OPENEXPERT_PICKER_KEY__;
      if (!apiKey) {
        toast.error(PICKER_KEY_HINT);
        return;
      }
      const outcome = await pickDriveFiles({
        accessToken: tokenAccess.accessToken,
        apiKey,
        appId:
          (window as unknown as { __OPENEXPERT_PICKER_APP_ID__?: string })
            .__OPENEXPERT_PICKER_APP_ID__ || "",
      });
      if (!outcome.files.length) {
        toast.info(
          `No se seleccionó ningún archivo (acción del Picker: ${outcome.action || "desconocida"}).`,
        );
        return;
      }
      await setGrantedFiles({ data: { files: outcome.files } });
      await qc.invalidateQueries({ queryKey: ["drive-grants"] });
      await qc.invalidateQueries({ queryKey: ["drive-status"] });
      await qc.invalidateQueries({ queryKey: ["workspace"] });
      toast.success(`${outcome.files.length} archivo(s) añadido(s).`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPickerLoading(false);
    }
  };

  const onRemoveGranted = async (id: string) => {
    const remaining = granted.data?.files.filter((f) => f.id !== id) ?? [];
    await setGrantedFiles({ data: { files: remaining } });
    await qc.invalidateQueries({ queryKey: ["drive-grants"] });
    await qc.invalidateQueries({ queryKey: ["workspace"] });
  };

  return (
    <div className="space-y-8 p-6">
      <section>
        <h2 className="mb-3 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {t("Google Drive")}
        </h2>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">Google Drive</div>
              <div className="mt-1 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                <span
                  className={`size-1.5 rounded-full ${drive.data?.connected ? "bg-success" : "bg-muted-foreground/40"}`}
                />
                {drive.data?.connected ? t("conectado") : t("desconectado")}
                {granted.data?.files.length
                  ? ` · ${granted.data.files.length} archivo(s) elegido(s)`
                  : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!drive.data?.configured && (
                <span className="text-xs text-muted-foreground">{PICKER_KEY_HINT}</span>
              )}
              {drive.data?.configured && !drive.data.connected && (
                <Button onClick={() => setConsentOpen(true)} disabled={connecting}>
                  {connecting ? t("Abriendo Google…") : t("Conectar mi cuenta")}
                </Button>
              )}
              {drive.data?.connected && (
                <>
                  <Button onClick={() => onPickFiles()} disabled={pickerLoading}>
                    {pickerLoading ? "Abriendo Picker…" : "Seleccionar archivos"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => sync.mutate({ data: { id: "gdrive" } })}
                    disabled={sync.isPending}
                  >
                    {sync.isPending ? t("Sincronizando…") : t("Sincronizar")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => disconnect.mutate()}
                    disabled={disconnect.isPending}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {t("Desconectar")}
                  </Button>
                </>
              )}
            </div>
          </div>

          <p className="mt-3 text-[0.7rem] text-muted-foreground">
            OpenExpert usa <code className="rounded bg-muted px-1">drive.file</code> (no sensible,
            archivo por archivo). Solo ves lo que elijas en el Picker. El contenido se envía al
            proveedor del modelo (por defecto local) para responderte.
          </p>
          <p className="mt-2 text-[0.7rem] text-muted-foreground">
            <em>
              The use of information received from Google Workspace scopes will adhere to the{" "}
              <a
                href={
                  consent.data?.consent?.privacyUrl ||
                  "https://github.com/OpenExpert-ai/OpenExpert/blob/main/PRIVACY.md"
                }
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Google User Data Policy
              </a>
              , including the Limited Use requirements.
            </em>
          </p>

          {granted.data?.files.length ? (
            <ul className="mt-4 space-y-1">
              {granted.data?.files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm"
                >
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="font-mono text-[0.7rem] text-muted-foreground">
                    {f.mimeType}
                  </span>
                  <button
                    onClick={() => onRemoveGranted(f.id)}
                    aria-label="Quitar archivo"
                    className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : drive.data?.connected ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Aún no has elegido archivos. Pulsa “Seleccionar archivos”.
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {t("Archivos locales")}
        </h2>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{t("Carpetas locales")}</div>
              <div className="mt-1 text-[0.7rem] text-muted-foreground">
                {roots.data?.roots.length
                  ? t("{n} carpeta(s) autorizada(s)", { n: roots.data.roots.length })
                  : t("Ninguna carpeta autorizada")}
              </div>
            </div>
            <Button
              onClick={() => {
                setBrowsePath(undefined);
                setLocalOpen(true);
              }}
              className="items-center gap-2"
            >
              <FolderPlus className="size-4" /> {t("Añadir carpeta")}
            </Button>
          </div>
          <p className="mt-3 text-[0.7rem] text-muted-foreground">
            {t(
              "El asistente puede leer y escribir (con tu aprobación) dentro de estas carpetas. El contenido se envía al modelo para responderte.",
            )}
          </p>
          {roots.data?.roots.length ? (
            <ul className="mt-4 space-y-1">
              {roots.data.roots.map((r) => (
                <li
                  key={r.path}
                  className="flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm"
                >
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="hidden truncate font-mono text-[0.7rem] text-muted-foreground sm:inline">
                    {r.path}
                  </span>
                  <button
                    onClick={() =>
                      removeRoot.mutate({ data: { path: r.path } }, { onSuccess: refreshRoots })
                    }
                    aria-label={t("Quitar carpeta")}
                    className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {t("Notion")}
        </h2>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">Notion</div>
              <div className="mt-1 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                <span
                  className={`size-1.5 rounded-full ${notion.data?.connected ? "bg-success" : "bg-muted-foreground/40"}`}
                />
                {notion.data?.connected ? t("conectado") : t("desconectado")}
                {notion.data?.workspace ? ` · ${notion.data.workspace}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!notion.data?.configured && (
                <span className="text-xs text-muted-foreground">
                  {t("Falta configurar el cliente OAuth de Notion en el servidor.")}
                </span>
              )}
              {notion.data?.configured && !notion.data.connected && (
                <Button onClick={onConnectNotion}>{t("Conectar Notion")}</Button>
              )}
              {notion.data?.connected && (
                <Button
                  variant="outline"
                  onClick={() => disconnectNotionAct.mutate()}
                  disabled={disconnectNotionAct.isPending}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {t("Desconectar")}
                </Button>
              )}
            </div>
          </div>
          <p className="mt-3 text-[0.7rem] text-muted-foreground">
            {t(
              "Conecta tu Notion: al autorizar eliges qué páginas y bases comparte con OpenExpert. El asistente puede buscarlas, consultarlas y editarlas (con tu aprobación).",
            )}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {t("Fuentes pendientes")}
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ws.integrations
            .filter((i) => i.id !== "gdrive" && i.id !== "local" && i.id !== "notion")
            .map((i) => (
              <div key={i.id} className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-3 p-4">
                  <div className="flex size-9 items-center justify-center rounded border border-border font-display text-lg">
                    {i.name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground">Pendiente de credenciales</div>
                  </div>
                  <span className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                    {t("Pendiente")}
                  </span>
                </div>
                <button
                  onClick={() => setOpen(open === i.id ? null : i.id)}
                  className="flex w-full items-center gap-1 border-t border-border px-4 py-2 text-[0.7rem] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={`size-3 transition ${open === i.id ? "rotate-180" : ""}`}
                  />{" "}
                  {t("Entidades")}
                </button>
                {open === i.id && (
                  <div className="space-y-1 px-4 pb-4 text-sm text-muted-foreground">
                    <p>(Pronto)</p>
                  </div>
                )}
              </div>
            ))}
        </div>
      </section>

      <Modal open={localOpen} onClose={() => setLocalOpen(false)} title={t("Elegir carpeta")}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              className={inputCls}
              value={browsePath ?? ""}
              onChange={(e) => setBrowsePath(e.target.value)}
              placeholder={t("Ruta absoluta (p. ej. /home/tu-usuario/Documentos)")}
            />
            <button
              className={btnGhost}
              onClick={() => qc.invalidateQueries({ queryKey: ["browse-local"] })}
            >
              {t("Ir")}
            </button>
          </div>
          {browse.isError ? (
            <p className="text-xs text-destructive">{(browse.error as Error).message}</p>
          ) : null}
          {browse.data ? (
            <div className="rounded-md border border-border">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <button
                  onClick={() => setBrowsePath(browse.data.parent ?? browse.data.path)}
                  disabled={!browse.data.parent}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  <ArrowUp className="size-3.5" /> {t("Subir")}
                </button>
                <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] text-muted-foreground">
                  {browse.data.path}
                </span>
              </div>
              <ul className="max-h-64 overflow-y-auto">
                {browse.data.entries.filter((e) => e.isDirectory).length === 0 && (
                  <li className="px-3 py-2 text-xs text-muted-foreground">
                    {t("Sin subcarpetas")}
                  </li>
                )}
                {browse.data.entries
                  .filter((e) => e.isDirectory)
                  .map((e) => (
                    <li key={e.path}>
                      <button
                        onClick={() => setBrowsePath(e.path)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent/60"
                      >
                        <Folder className="size-4 shrink-0 text-primary" />
                        <span className="truncate">{e.name}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : browse.isLoading ? (
            <p className="text-xs text-muted-foreground">{t("Cargando…")}</p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] text-muted-foreground">
              {browse.data?.path}
            </span>
            <button
              className={btnPrimary}
              disabled={!browse.data || addRoot.isPending}
              onClick={() =>
                browse.data &&
                addRoot.mutate(
                  { data: { path: browse.data.path } },
                  {
                    onSuccess: () => {
                      setLocalOpen(false);
                      refreshRoots();
                    },
                  },
                )
              }
            >
              {addRoot.isPending ? t("Añadiendo…") : t("Añadir esta carpeta")}
            </button>
          </div>
          <p className="text-[0.7rem] text-muted-foreground">
            {t("Solo se listan carpetas; no se lee ningún archivo al elegirlas.")}
          </p>
        </div>
      </Modal>

      <AlertDialog open={consentOpen} onOpenChange={setConsentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conectar Google Drive</AlertDialogTitle>
            <AlertDialogDescription>
              OpenExpert va a acceder a Google Drive con tu consentimiento. Antes de continuar,
              confirma que entiendes lo siguiente:
              <ul className="ml-4 mt-3 list-disc space-y-1 text-xs">
                <li>
                  Solo pedimos el scope <strong>drive.file</strong> (no sensible). El asistente no
                  puede leer ni listar tu Drive completo.
                </li>
                <li>
                  Con el Picker elegirás <strong>archivo por archivo</strong> qué puede ver
                  OpenExpert.
                </li>
                <li>
                  El contenido de los archivos elegidos se transmite al modelo para responderte; usa
                  <strong> Ollama local</strong> si no quieres que salga de tu equipo.
                </li>
                <li>
                  No usamos tus datos para entrenar modelos. No los vendemos ni los cedemos a
                  terceros.
                </li>
                <li>
                  Los tokens se guardan cifrados (AES-GCM) en <code>~/.openexpert/</code> con modo
                  0600.
                </li>
              </ul>
              <p className="mt-3 text-[0.7rem]">
                <em>
                  The use of information received from Google Workspace scopes will adhere to the
                  Google User Data Policy, including the Limited Use requirements.
                </em>
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConsentOpen(false);
                onAcceptConsentAndConnect().catch(() => {});
              }}
            >
              Entiendo y conecto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
