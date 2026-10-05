// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import { isSameOrigin, securityHeaders } from "./http.server";

describe("isSameOrigin", () => {
  const fake = (origin: string | null, host: string): Request =>
    ({ headers: { get: (h: string) => (h === "origin" ? origin : host) } }) as unknown as Request;

  it("treats requests without an Origin header as same-origin", () => {
    expect(isSameOrigin(fake(null, "localhost"))).toBe(true);
  });

  it("matches the Origin host against the Host header", () => {
    expect(isSameOrigin(fake("http://localhost", "localhost"))).toBe(true);
    expect(isSameOrigin(fake("http://evil.test", "localhost"))).toBe(false);
  });

  it("returns false for an unparseable Origin", () => {
    expect(isSameOrigin(fake("::not a url::", "localhost"))).toBe(false);
  });
});

describe("securityHeaders", () => {
  it("omits the CSP outside production", () => {
    expect(securityHeaders(false)["Content-Security-Policy"]).toBeUndefined();
  });

  it("allows the Google Picker in production", () => {
    const csp = securityHeaders(true)["Content-Security-Policy"] ?? "";
    expect(csp).toContain("https://apis.google.com");
    expect(csp).toContain("frame-src https://docs.google.com");
  });
});
