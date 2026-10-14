// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { looksLikeOpenExpert } from "../src/cli/desktop.js";

/**
 * Headers copied verbatim from a real `GET /expert` response of the local
 * server (production) on 2026-10-14. Keep them literal: this is the contract
 * `openexpert desktop` uses to decide whether it can reuse a running server.
 */
const OPENEXPERT = new Headers({
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com",
  "x-frame-options": "DENY",
  "x-request-id": "156e1ba5-249b-47e4-88dd-7267b60a2f5b",
});

/** Development mode: no CSP, still `x-request-id` + security headers. */
const OPENEXPERT_DEV = new Headers({
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-request-id": "2c6f6a52-6f4b-4d1a-9d3f-9b1f0a7c5e21",
});

/** Headers of an unrelated Express service occupying the port. */
const OTHER_APP = new Headers({
  "x-powered-by": "Express",
  "content-security-policy": "default-src 'none'",
  "content-type": "text/html; charset=utf-8",
});

describe("looksLikeOpenExpert", () => {
  it("accepts the OpenExpert server, whatever the status", () => {
    expect(looksLikeOpenExpert(200, OPENEXPERT)).toBe(true);
    expect(looksLikeOpenExpert(307, OPENEXPERT)).toBe(true);
  });

  it("accepts it in development too (no CSP header)", () => {
    expect(looksLikeOpenExpert(200, OPENEXPERT_DEV)).toBe(true);
  });

  it("rejects another app on the port (Express 'Cannot GET /')", () => {
    expect(looksLikeOpenExpert(404, OTHER_APP)).toBe(false);
    expect(looksLikeOpenExpert(200, OTHER_APP)).toBe(false);
  });

  it("rejects an OpenExpert-shaped answer that is failing", () => {
    expect(looksLikeOpenExpert(500, OPENEXPERT)).toBe(false);
    expect(looksLikeOpenExpert(502, OPENEXPERT)).toBe(false);
  });
});
