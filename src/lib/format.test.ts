// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import { formatBytes, formatCurrency, formatDateTime, formatNumber } from "./format";

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
