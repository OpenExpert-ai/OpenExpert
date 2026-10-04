// SPDX-License-Identifier: MIT
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useAct, useDriveStatus, useMe, useWorkspace, fmtTime } from "@/lib/store";
import { disconnectDrive, startDriveAuth, syncIntegration } from "@/lib/data.functions";

export const Route = createFileRoute("/_authenticated/integrations/sources")({
  head: () => ({
    meta: [
      { title: "Fuentes de Datos — OpenExpert" },
      { name: "description", content: "Conectores CRM, ERP, publicidad y productividad." },
      { property: "og:title", content: "Fuentes de Datos — OpenExpert" },
      {
        property: "og:description",
        content: "Pipedrive, Salesforce, Holded, Meta Ads, Google y Slack.",
      },
    ],
  }),
  component: SourcesPage,
});

function SourcesPage() {
  const { data: ws } = useWorkspace();
  const me = useMe(ws);
  const drive = useDriveStatus();
  const nav = useNavigate();
  const search = useSearch({ strict: false }) as { gdrive?: string };
  const sync = useAct(syncIntegration, "Google Drive sincronizado");
  const disconnect = useAct(disconnectDrive, "Google Drive desconectado");
  const [open, setOpen] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (search.gdrive === "ok") {
      toast.success("Google Drive conectado");
      nav({ search: {} as never });
    } else if (search.gdrive) {
      toast.error("No se pudo conectar Google Drive");
      nav({ search: {} as never });
    }
  }, [search.gdrive]);

  if (!ws || !me) return null;

  const connect = async () => {
    setConnecting(true);
    try {
      const { url } = await startDriveAuth();
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  };

  const cats = [...new Set(ws.integrations.map((i) => i.category))];
  return (
    <div className="space-y-8 p-6">
      {cats.map((c) => (
        <section key={c}>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            {c}
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ws.integrations
              .filter((i) => i.category === c)
              .map((i) => {
                const entities = i.entities as { name: string; count: number }[];
                const isDrive = i.id === "gdrive";
                const mine = isDrive && drive.data?.connected;
                return (
                  <div key={i.id} className="rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-3 p-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded border border-border font-display text-lg">
                        {i.name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{i.name}</div>
                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${i.connected ? "bg-success" : "bg-muted-foreground/40"}`}
                          />
                          {i.connected ? `sync ${fmtTime(i.last_sync)}` : "desconectado"}
                        </div>
                      </div>
                      {!isDrive ? (
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Pendiente
                        </span>
                      ) : (
                        <>
                          {!mine && (
                            <button
                              disabled={connecting || drive.data?.configured === false}
                              title={
                                drive.data?.configured === false
                                  ? "Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"
                                  : ""
                              }
                              onClick={connect}
                              className="rounded-md border border-primary px-3 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-40"
                            >
                              {connecting ? "Abriendo Google…" : "Conectar mi cuenta"}
                            </button>
                          )}
                          {mine && !i.connected && (
                            <button
                              disabled={me.role === "LECTOR" || sync.isPending}
                              onClick={() => sync.mutate({ data: { id: "gdrive" } })}
                              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                            >
                              {sync.isPending ? "Sincronizando…" : "Activar"}
                            </button>
                          )}
                          {i.connected && (
                            <button
                              disabled={me.role === "LECTOR" || sync.isPending}
                              onClick={() => sync.mutate({ data: { id: "gdrive" } })}
                              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                            >
                              {sync.isPending ? "Sincronizando…" : "Sincronizar"}
                            </button>
                          )}
                          {mine && (
                            <button
                              disabled={me.role !== "ADMIN" || disconnect.isPending}
                              title={me.role !== "ADMIN" ? "Solo ADMIN" : ""}
                              onClick={() => disconnect.mutate()}
                              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-40"
                            >
                              Desconectar
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {isDrive && (
                      <div className="px-4 pb-3 font-mono text-[10px] text-muted-foreground">
                        {mine
                          ? "Tu cuenta de Google está conectada"
                          : "Conecta tu cuenta de Google para buscar, leer y crear archivos"}
                      </div>
                    )}
                    <button
                      onClick={() => setOpen(open === i.id ? null : i.id)}
                      className="flex w-full items-center gap-1 border-t border-border px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown
                        className={`h-3 w-3 transition ${open === i.id ? "rotate-180" : ""}`}
                      />{" "}
                      Entidades sincronizadas
                    </button>
                    {open === i.id && (
                      <div className="space-y-1 px-4 pb-4">
                        {entities.map((e) => (
                          <div key={e.name} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{e.name}</span>
                            <span className="font-mono">
                              {i.connected ? e.count.toLocaleString("es-ES") : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
