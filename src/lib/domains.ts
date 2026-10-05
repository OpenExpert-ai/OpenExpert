// SPDX-License-Identifier: MIT
// Business domains an Expert may read. Client-safe: no server imports, so the
// UI and the chat tools share the same list.
//
// The domain slugs match the resources in `src/lib/ai/tools.ts`:
//   ventas   -> deals / pipeline
//   finanzas -> invoices
//   marketing -> campaigns
//   general  -> accounts (churn) — kept as `general` for backward compatibility
//               with the seeded data and the AI docs.
export const EXPERT_DOMAINS = ["ventas", "finanzas", "marketing", "clientes"] as const;

export type ExpertDomain = (typeof EXPERT_DOMAINS)[number];

/** Human labels for the domain selector (translated through `t()` in the UI). */
export const EXPERT_DOMAIN_LABELS: Record<ExpertDomain, string> = {
  ventas: "Ventas",
  finanzas: "Finanzas",
  marketing: "Marketing",
  clientes: "Cuentas / churn",
};

export function isExpertDomain(value: string): value is ExpertDomain {
  return (EXPERT_DOMAINS as readonly string[]).includes(value);
}
