// SPDX-License-Identifier: MIT
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Configuración — OpenExpert" },
      {
        name: "description",
        content: "Modelo de IA, apariencia y datos de tu instalación local de OpenExpert.",
      },
      { property: "og:title", content: "Configuración — OpenExpert" },
      { property: "og:description", content: "Ajustes locales de OpenExpert." },
    ],
  }),
  component: () => (
    <div>
      <PageHeader
        eyebrow="Ajustes"
        title="Configuración"
        desc="Modelo de IA, apariencia y datos de tu instalación local. Todo se guarda en tu equipo."
      />
      <div className="flex gap-1 overflow-x-auto border-b border-border px-6">
        {(
          [
            ["/settings/ai", "Modelo e IA"],
            ["/settings/chat", "Chat y agentes"],
            ["/settings/data", "Datos y copias"],
            ["/settings/appearance", "Apariencia"],
            ["/settings/advanced", "Avanzado"],
            ["/settings/about", "Acerca de"],
          ] as const
        ).map(([to, label]) => (
          <Link
            key={to}
            to={to}
            className="-mb-px whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: "!border-primary !text-foreground" }}
          >
            {label}
          </Link>
        ))}
      </div>
      <Outlet />
    </div>
  ),
});
