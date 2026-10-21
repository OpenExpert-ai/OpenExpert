// SPDX-License-Identifier: MIT
// Locale-aware formatting so dates, numbers and currency follow the interface
// language instead of being hard-coded to Spanish.
import type { Locale } from "@/lib/i18n";

const tag = (locale: Locale) => (locale === "en" ? "en-GB" : "es-ES");

export function formatDateTime(iso: string, locale: Locale = "es"): string {
  return new Date(iso).toLocaleString(tag(locale), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
