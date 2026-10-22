// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { calendarDay, daysSince } from "./calendar-day";

/** The instant a local calendar day starts at, whatever the timezone is. */
function localStart(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

describe("calendarDay", () => {
  it("reads a plain date as the day it writes, not as UTC midnight", () => {
    const day = calendarDay("2026-09-01");
    expect(day).not.toBeNull();
    expect(day!.getFullYear()).toBe(2026);
    expect(day!.getMonth()).toBe(8);
    expect(day!.getDate()).toBe(1);
  });

  it("accepts a date with a time appended", () => {
    const day = calendarDay("2026-09-01T10:00:00Z");
    expect(day!.getFullYear()).toBe(2026);
    expect(day!.getMonth()).toBe(8);
    expect(day!.getDate()).toBe(1);
  });

  it("refuses a text that is not a date", () => {
    expect(calendarDay("")).toBeNull();
    expect(calendarDay("ayer")).toBeNull();
    expect(calendarDay("01/09/2026")).toBeNull();
    expect(calendarDay("2026-9-1")).toBeNull();
  });

  it("refuses a day that does not exist instead of rolling it over", () => {
    expect(calendarDay("2026-02-30")).toBeNull();
    expect(calendarDay("2026-13-01")).toBeNull();
    expect(calendarDay("2026-00-10")).toBeNull();
    expect(calendarDay("2026-04-31")).toBeNull();
  });

  it("reads a leap day in a leap year", () => {
    expect(calendarDay("2028-02-29")).not.toBeNull();
    expect(calendarDay("2026-02-29")).toBeNull();
  });
});

describe("daysSince", () => {
  it("counts calendar days, so the hour of the day does not change the answer", () => {
    const due = "2026-09-01";
    // Five minutes into the day after the due date: one day late.
    expect(daysSince(due, localStart(2026, 9, 2, 0, 5))).toBe(1);
    // Half an hour before midnight: still one day late.
    expect(daysSince(due, localStart(2026, 9, 2, 23, 30))).toBe(1);
  });

  it("counts the days between the due date and now, not one more", () => {
    expect(daysSince("2026-09-01", localStart(2026, 9, 10, 15, 0))).toBe(9);
    expect(daysSince("2026-09-01", localStart(2026, 9, 2, 12, 0))).toBe(1);
  });

  it("gives 0 on the day the invoice falls due", () => {
    expect(daysSince("2026-09-01", localStart(2026, 9, 1, 0, 0))).toBe(0);
    expect(daysSince("2026-09-01", localStart(2026, 9, 1, 23, 59))).toBe(0);
  });

  it("never gives a negative number of days", () => {
    // A row marked overdue whose due date is in the future is dirty data: the
    // debt cannot have been running for a negative number of days.
    expect(daysSince("2026-12-01", localStart(2026, 10, 22, 12, 0))).toBe(0);
    expect(daysSince("2099-01-01", localStart(2026, 10, 22, 12, 0))).toBe(0);
  });

  it("gives 0 for a date that cannot be read", () => {
    expect(daysSince("", localStart(2026, 10, 22, 12, 0))).toBe(0);
    expect(daysSince("ayer", localStart(2026, 10, 22, 12, 0))).toBe(0);
  });

  it("counts a day across a change of daylight saving time", () => {
    // The clocks move on the 25th of October 2026 in Europe, so the day
    // between the 24th and the 26th is 25 hours long.
    expect(daysSince("2026-10-24", localStart(2026, 10, 26, 12, 0))).toBe(2);
    expect(daysSince("2026-10-25", localStart(2026, 10, 26, 12, 0))).toBe(1);
  });
});
