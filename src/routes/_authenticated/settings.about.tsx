// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { getSettings } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/settings/about")({
  component: AboutSettings,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2.5 last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <code className="break-all text-right text-sm">{value}</code>
    </div>
  );
}

function AboutSettings() {
  const get = useServerFn(getSettings);
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => get() });

  if (!data) {
    return (
      <div className="flex items-center gap-2 p-6 font-mono text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }

  const { runtime, paths, ai } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-display text-xl">OpenExpert</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edición local, propietario único. Todos los datos permanecen en tu equipo.
        </p>
        <div className="mt-4">
          <Row label="Versión" value={runtime.version} />
          <Row label="Node.js" value={runtime.node} />
          <Row label="Puerto" value={runtime.port} />
          <Row label="Modelo" value={`${ai.provider}:${ai.modelId}`} />
          <Row label="Licencia" value="MIT" />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-display text-xl">Rutas</h2>
        <div className="mt-4">
          <Row label="Datos" value={paths.dataDir} />
          <Row label="Configuración" value={paths.config} />
          <Row label="Secretos" value={paths.secrets} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          El fichero de secretos se guarda con permisos <code>0600</code>.
        </p>
      </section>
    </div>
  );
}
