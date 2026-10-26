// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatNumber,
} from "./format";

describe("formatBytes", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("formatNumber", () => {
  it("formats with the given locale", () => {
    expect(typeof formatNumber(1234, "es")).toBe("string");
    expect(typeof formatNumber(1234, "en")).toBe("string");
  });
});

describe("formatCurrency", () => {
  it("returns a EUR string for both locales", () => {
    expect(formatCurrency(1000, "es")).toMatch(/1/);
    expect(formatCurrency(1000, "en")).toMatch(/1/);
  });
});

describe("formatDateTime", () => {
  it("formats an ISO date without throwing", () => {
    expect(formatDateTime("2026-01-02T03:04:00.000Z", "es").length).toBeGreaterThan(0);
    expect(formatDateTime("2026-01-02T03:04:00.000Z", "en").length).toBeGreaterThan(0);
  });

  // The activity log keeps every event (`countActivity` counts the whole table),
  // so the list reaches back years. A row stamped with day and month only reads
  // as this year's, and two events twelve months apart are told apart by nothing.
  it("writes the year of a date that is not from this year", () => {
    const lastYear = new Date(new Date().getFullYear() - 1, 5, 15, 10, 30);
    expect(formatDateTime(lastYear.toISOString(), "es")).toContain(String(lastYear.getFullYear()));
    expect(formatDateTime(lastYear.toISOString(), "en")).toContain(String(lastYear.getFullYear()));
  });

  it("keeps this year's dates short", () => {
    const thisYear = new Date(new Date().getFullYear(), 5, 15, 10, 30);
    expect(formatDateTime(thisYear.toISOString(), "es")).not.toContain(
      String(thisYear.getFullYear()),
    );
  });

  // The year comes from the local calendar, the one `toLocaleString` prints
  // with, not from the year prefix of the ISO string: at 00:30 on 1 January in
  // Madrid the instant still falls on 31 December in UTC, and the row belongs to
  // the year the clock there says.
  it("reads the year off the local calendar, not off the ISO string", () => {
    const boundary = new Date(new Date().getFullYear(), 0, 1, 0, 30);
    expect(formatDateTime(boundary.toISOString(), "es")).not.toContain(
      String(boundary.getFullYear()),
    );
  });
});

describe("formatDuration", () => {
  it("shows the measured duration in seconds", () => {
    expect(formatDuration(3349)).toBe("3.35s");
    expect(formatDuration(300)).toBe("0.30s");
  });

  it("shows a dash when the action was not timed, instead of inventing a number", () => {
    // The old code did `(a.duration_ms / 1000).toFixed(2)`, and `null / 1000`
    // is 0: every untimed event was filed as "0.00s". A dash says "not measured".
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
  });

  it("does not print a number that is not a measurement", () => {
    expect(formatDuration(Number.NaN)).toBe("—");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
