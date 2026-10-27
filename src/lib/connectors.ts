// SPDX-License-Identifier: MIT
// Field mapping for the optional business connectors. Kept pure so the rules
// are testable without a network or a database; the fetch/upsert lives in
// `connectors.server.ts`.

export type PipedriveDeal = {
  id?: number | string;
  title?: string;
  value?: number | string | null;
  currency?: string;
  status?: string;
  stage_id?: number | string;
  stage_change_time?: string | null;
  update_time?: string | null;
  add_time?: string | null;
  expected_close_date?: string | null;
  close_time?: string | null;
  org_name?: string | null;
  person_name?: string | null;
  owner_name?: string | null;
  deleted?: boolean;
};

export type HoldedInvoice = {
  id?: string;
  document_number?: string | null;
  contact_id?: string | null;
  contact_name?: string | null;
  date?: string | null;
  due_date?: string | null;
  total?: string | number | null;
  payments_pending?: string | number | null;
  status?: string | null;
};

import { calendarDay } from "./calendar-day";
import { parseMoney, type DealInput, type InvoiceInput } from "./business-csv";

function daysSince(value: string | null | undefined, now: Date): number {
  if (!value) return 0;
  const stamp = Date.parse(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
  if (!Number.isFinite(stamp)) return 0;
  const days = Math.floor((now.getTime() - stamp) / 86_400_000);
  return Math.max(0, days);
}

/**
 * The provider sends ISO dates (`2026-09-30`, sometimes with a time behind), so
 * the first ten characters are taken — but only when that day exists:
 * `2026-02-31` would be stored as written and `calendarDay` rejects it
 * downstream, so the invoice would show as «0 días» overdue for ever.
 */
function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) return null;
  const day = match[0];
  return calendarDay(day) ? day : null;
}

/** One Pipedrive deal as the local `deals` row, or null when it is unusable. */
export function mapPipedriveDeal(
  deal: PipedriveDeal,
  stages: Map<string, string>,
  now = new Date(),
): DealInput | null {
  if (deal.id === undefined || deal.deleted) return null;
  const company = deal.org_name?.trim() || deal.person_name?.trim() || deal.title?.trim();
  if (!company) return null;
  const stageId = deal.stage_id === undefined ? "" : String(deal.stage_id);
  return {
    id: `pd-${deal.id}`,
    company,
    stage: stages.get(stageId) ?? (stageId ? `Etapa ${stageId}` : "Sin etapa"),
    value: typeof deal.value === "number" ? deal.value : Number(deal.value ?? 0) || 0,
    owner: deal.owner_name?.trim() ?? "",
    daysInStage: daysSince(deal.stage_change_time ?? deal.update_time ?? deal.add_time, now),
    closeDate: isoDate(deal.expected_close_date ?? deal.close_time),
    status: deal.status === "won" || deal.status === "lost" ? deal.status : "open",
  };
}

/** Holded's payment status is more granular than the local `open/paid` pair. */
function holdedStatus(value: string | null | undefined): string {
  if (value === "completed") return "paid";
  if (value === "cancelled" || value === "failed") return "cancelled";
  return "open";
}

/** One Holded invoice as the local `invoices` row, or null when it is unusable. */
export function mapHoldedInvoice(invoice: HoldedInvoice): InvoiceInput | null {
  if (!invoice.id) return null;
  const client = invoice.contact_name?.trim() || invoice.contact_id?.trim();
  if (!client) return null;
  const dueDate = isoDate(invoice.due_date) ?? isoDate(invoice.date);
  if (!dueDate) return null;
  const raw = invoice.total ?? invoice.payments_pending ?? 0;
  // Same rule as the CSV importer: `1.234,56` is one thousand two hundred and
  // not NaN → 0. And a total that cannot be read rejects the row instead of
  // importing a debt of zero euros that nobody asked for.
  const amount =
    typeof raw === "number" ? (Number.isFinite(raw) ? raw : null) : parseMoney(String(raw));
  if (amount === null) return null;
  return {
    id: `holded-${invoice.id}`,
    client,
    amount,
    dueDate,
    status: holdedStatus(invoice.status),
    reminders: 0,
  };
}
