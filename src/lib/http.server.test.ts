// SPDX-License-Identifier: MIT
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fetchWithTimeout, isSameOrigin, securityHeaders } from "./http.server";

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

describe("fetchWithTimeout", () => {
  // A server that accepts the connection and never answers: the shape of a proxy that tarpits or a
  // provider that stops replying. Undici's `fetch` has no timeout of its own, so without this the
  // chat turn stayed streaming until the user pressed Stop.
  let server: Server;
  let url: string;

  beforeAll(async () => {
    server = createServer(() => {
      // Deliberately no response.
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/never`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("gives up and says which service did not answer", async () => {
    await expect(
      fetchWithTimeout(url, {}, { service: "Google Drive", timeoutMs: 200 }),
    ).rejects.toThrow(/Google Drive no respondió en 200 ms/);
  });

  it("returns the response when the service does answer", async () => {
    const res = await fetchWithTimeout(
      `data:text/plain,hola`,
      {},
      { service: "Prueba", timeoutMs: 1_000 },
    );
    expect(await res.text()).toBe("hola");
  });
});
