// SPDX-License-Identifier: MIT
// Calendar-day arithmetic for the dates the application stores as plain text.
//
// A date like `2026-09-01` names a calendar day, not an instant: `new Date`
// reads it as UTC midnight, which in any timezone behind UTC is the *previous*
// day and in any timezone ahead of UTC the same day at a different hour. The
// days between two calendar days are counted on the day index and not on the
// milliseconds between two instants, so neither a timezone offset nor a
// daylight-saving change can add or remove a day.

/** A plain date: four digits of year, two of month, two of day. */
const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** The day index of a date, counted on its local calendar day. */
function dayIndex(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

/**
 * The calendar day a plain date stands for, read in the local timezone.
 *
 * The text is read as the day it writes — `2026-09-01` is the first of
 * September wherever the reader is — and not as the instant `new Date` would
 * build, which is UTC midnight and therefore the previous day in every
 * timezone behind UTC.
 *
 * Returns null when the text is not a date or names a day that does not exist
 * (`2026-02-30`), so a dirty row cannot roll over into another month.
 */
export function calendarDay(value: string): Date | null {
  const match = PLAIN_DATE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
  const date = new Date(year, month - 1, day);
  // `new Date(26, 0, 1)` means 1926, and `2026-02-30` rolls over into March:
  // both would silently move the day, so the round trip has to agree.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/**
 * The whole days between a plain date and an instant, in the local timezone.
 *
 * The count is of calendar days: the day the date names against the day the
 * instant falls in. A date that has not passed yet, and a text that is not a
 * date at all, give 0 — how long a debt has been running is never negative
 * and never unknown.
 */
export function daysSince(value: string, now: Date): number {
  const from = calendarDay(value);
  if (!from) return 0;
  const days = dayIndex(now) - dayIndex(from);
  return days > 0 ? days : 0;
}
