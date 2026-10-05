// SPDX-License-Identifier: MIT
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Integraciones — OpenExpert" },
      {
        name: "description",
        content: "Conecta fuentes de datos a tus Expertos con límites de seguridad.",
      },
      { property: "og:title", content: "Integraciones — OpenExpert" },
      { property: "og:description", content: "Conectores de tu empresa." },
    ],
  }),
  component: IntegrationsLayout,
});

function IntegrationsLayout() {
  const { t } = useT();
  return (
    <div>
      <PageHeader
        eyebrow={t("Integraciones")}
        title={t("Integraciones")}
        desc={t("Fuentes de datos conectadas a tus Expertos.")}
      />
      <div className="flex gap-1 border-b border-border px-6">
        {([["/integrations/sources", "Fuentes de Datos"]] as const).map(([to, label]) => (
          <Link
            key={to}
            to={to}
            className="-mb-px border-b-2 border-transparent px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: "!border-primary !text-foreground" }}
          >
            {t(label)}
          </Link>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
