// SPDX-License-Identifier: MIT
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Procesos e Integraciones — OpenExpert" },
      {
        name: "description",
        content: "Conecta fuentes de datos y gestiona procesos autónomos con límites de seguridad.",
      },
      { property: "og:title", content: "Procesos e Integraciones — OpenExpert" },
      { property: "og:description", content: "Conectores y agentes autónomos de tu empresa." },
    ],
  }),
  component: () => (
    <div>
      <PageHeader
        eyebrow="Procs"
        title="Procesos e Integraciones"
        desc="Fuentes de datos sincronizadas y agentes autónomos gobernados por límites y aprobación humana."
      />
      <div className="flex gap-1 border-b border-border px-6">
        {(
          [
            ["/integrations/sources", "Fuentes de Datos"],
            ["/integrations/processes", "Procesos Autónomos"],
          ] as const
        ).map(([to, l]) => (
          <Link
            key={to}
            to={to}
            className="-mb-px border-b-2 border-transparent px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: "!border-primary !text-foreground" }}
          >
            {l}
          </Link>
        ))}
      </div>
      <Outlet />
    </div>
  ),
});
