// SPDX-License-Identifier: MIT
// OpenCore — tool catalog (the current 14).
// The model never touches the database directly: it only calls these
// functions, and each one checks your permission before answering.

export type ToolDomain = "ventas" | "finanzas" | "marketing" | "general" | "transversal" | "drive";

export type ToolDef = {
  name: string;
  domain: ToolDomain;
  needs: "read" | "exec";
  proposesOnly: boolean;
};

export const TOOL_CATALOG: ToolDef[] = [
  { name: "get_pipeline_summary", domain: "ventas", needs: "read", proposesOnly: false },
  { name: "list_deals", domain: "ventas", needs: "read", proposesOnly: false },
  { name: "list_overdue_invoices", domain: "finanzas", needs: "read", proposesOnly: false },
  { name: "get_campaign_performance", domain: "marketing", needs: "read", proposesOnly: false },
  { name: "get_churn_risk", domain: "general", needs: "read", proposesOnly: false },
  { name: "list_processes", domain: "transversal", needs: "read", proposesOnly: false },
  { name: "search_drive", domain: "drive", needs: "read", proposesOnly: false },
  { name: "read_drive_file", domain: "drive", needs: "read", proposesOnly: false },
  { name: "create_drive_file", domain: "drive", needs: "exec", proposesOnly: false },
  { name: "update_drive_file", domain: "drive", needs: "exec", proposesOnly: false },
  { name: "propose_invoice_reminders", domain: "finanzas", needs: "exec", proposesOnly: true },
  { name: "propose_pause_campaigns", domain: "marketing", needs: "exec", proposesOnly: true },
  { name: "request_process_run", domain: "transversal", needs: "exec", proposesOnly: true },
  { name: "open_expert_form", domain: "transversal", needs: "exec", proposesOnly: false },
];
