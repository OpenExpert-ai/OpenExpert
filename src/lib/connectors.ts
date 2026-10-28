// SPDX-License-Identifier: MIT
// Field mapping for the optional business connectors. Kept pure so the rules
// are testable without a network or a database; the fetch/upsert lives in
// `connectors.server.ts`.

import { DEAL_STATUS, INVOICE_STATUS } from "./business-status";

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

import { calendarDay, daysSinceInstant } from "./calendar-day";
import { parseMoney, type DealInput, type InvoiceInput } from "./business-csv";

/** A zone designator at the end of a timestamp: `Z` or `+02:00` / `-0500`. */
const ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * The instant a provider timestamp names.
 *
 * Pipedrive writes its datetimes in UTC and without a zone (`2026-10-27
 * 22:00:00`), so a space has to become the `T` that `Date.parse` expects and a
 * value with no zone is read as UTC — appending the `Z` — instead of being
 * taken as local time, which would move the day by the offset of the machine.
 * A value that does come with `Z` or an offset is respected as written.
 */
function instantOf(value: string): Date | null {
  const text = value.trim().replace(" ", "T");
  // Without a zone the timestamp is UTC; a plain date has no time to zone and
  // lands on UTC midnight, the convention the rest of the module follows.
  const stamp = Date.parse(ZONE.test(text) ? text : `${text}Z`);
  return Number.isFinite(stamp) ? new Date(stamp) : null;
}

/**
 * Days the deal has been in its stage, counted as calendar days: a change made
 * yesterday is one day, whatever the hour of the question. The count is done on
 * instants by `calendar-day` so the reader of a provider timestamp and the
 * reader of a stored date answer with the same days.
 */
function daysSince(value: string | null | undefined, now: Date): number {
  if (!value) return 0;
  const stamp = instantOf(value);
  if (!stamp) return 0;
  return daysSinceInstant(stamp, now);
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
    status:
      deal.status === DEAL_STATUS.won || deal.status === DEAL_STATUS.lost
        ? deal.status
        : DEAL_STATUS.open,
  };
}

/** Holded's payment status is more granular than the local `open/paid` pair. */
function holdedStatus(value: string | null | undefined): string {
  if (value === "completed") return INVOICE_STATUS.paid;
  if (value === "cancelled" || value === "failed") return INVOICE_STATUS.cancelled;
  return INVOICE_STATUS.open;
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
