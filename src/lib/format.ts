// SPDX-License-Identifier: MIT
// Locale-aware formatting so dates, numbers and currency follow the interface
// language instead of being hard-coded to Spanish.
import type { Locale } from "@/lib/i18n";

const tag = (locale: Locale) => (locale === "en" ? "en-GB" : "es-ES");

/**
 * The day, month and time of an event, with the year only when it is not the
 * current one.
 *
 * The activity log keeps every event, so the list reaches back years: a row
 * stamped "15 jun, 10:30" reads as this year's, and two events twelve months
 * apart are told apart by nothing. The year is written for any other year, and
 * it is read from the local calendar —the one `toLocaleString` prints with— so
 * an event on 31 December at 23:30 in Madrid belongs to the year the clock
 * there says, not to the UTC one.
 */
export function formatDateTime(iso: string, locale: Locale = "es"): string {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
  return date.toLocaleString(tag(locale), options);
}

export function formatNumber(n: number, locale: Locale = "es"): string {
  return n.toLocaleString(tag(locale));
}

export function formatCurrency(n: number, locale: Locale = "es"): string {
  return new Intl.NumberFormat(tag(locale), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The duration of an action, in seconds, or a dash when it was not measured.
 *
 * Most activity events are not timed, and a number that nobody measured reads
 * in the audit trail as a real one. `null` therefore stays `null`: the screen
 * shows a dash instead of inventing a figure.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  return `${(ms / 1000).toFixed(2)}s`;
}
