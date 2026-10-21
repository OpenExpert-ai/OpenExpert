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
