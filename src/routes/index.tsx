// SPDX-License-Identifier: MIT
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpenExpert — Habla con tu empresa" },
      {
        name: "description",
        content:
          "Sistema operativo empresarial con agentes de IA, Experts, RBAC y auditoría reversible.",
      },
      { property: "og:title", content: "OpenExpert — Habla con tu empresa" },
      {
        property: "og:description",
        content: "Agentes de IA, gobierno de datos y control de auditoría para tu empresa.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/expert" });
  },
});
