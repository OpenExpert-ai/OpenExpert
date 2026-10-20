import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  allowedHosts,
  fetchWithTimeout,
  isAllowedHost,
  isSameOrigin,
  securityHeaders,
} from "./http.server";

/** A request-shaped object carrying just the headers the check reads. */
const fake = (origin: string | null, host: string, method = "GET"): Request =>
  ({
    method,
    headers: {
      get: (h: string) => (h === "origin" ? origin : h === "host" ? host : null),
    },
  }) as unknown as Request;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isSameOrigin", () => {
  it("treats a request without an Origin header as same-origin when it is a safe method", () => {
    expect(isSameOrigin(fake(null, "localhost"))).toBe(true);
    expect(isSameOrigin(fake(null, "localhost:3000", "GET"))).toBe(true);
    expect(isSameOrigin(fake(null, "localhost:3000", "HEAD"))).toBe(true);
  });

  it("rejects a request without an Origin that has side effects", () => {
    // A cross-site form/fetch would carry an Origin; a POST without one is not
    // something a browser does, and letting it through was free for an attacker.
    expect(isSameOrigin(fake(null, "localhost:3000", "POST"))).toBe(false);
    expect(isSameOrigin(fake(null, "localhost:3000", "DELETE"))).toBe(false);
  });

  it("matches the Origin against the server's own hosts", () => {
    expect(isSameOrigin(fake("http://localhost:3000", "localhost:3000"))).toBe(true);
    expect(isSameOrigin(fake("http://127.0.0.1:3000", "127.0.0.1:3000"))).toBe(true);
    expect(isSameOrigin(fake("http://evil.test", "localhost:3000"))).toBe(false);
  });

  it("rejects a Host the server does not serve, even when Origin matches it (DNS rebinding)", () => {
    // The attack: evil.test resolves to 127.0.0.1, so the browser sends
    // `Host: evil.test:3000` and `Origin: http://evil.test:3000`. Comparing the
    // two against each other said "same origin".
    expect(isSameOrigin(fake("http://evil.test:3000", "evil.test:3000"))).toBe(false);
    expect(isSameOrigin(fake("http://evil.test.com", "evil.test.com:3000"))).toBe(false);
  });

  it("returns false for an unparseable Origin", () => {
    expect(isSameOrigin(fake("::not a url::", "localhost"))).toBe(false);
  });

  it("accepts a host the server was told to listen on", () => {
    vi.stubEnv("OPENEXPERT_HOST", "192.168.1.10");
    expect(isSameOrigin(fake("http://192.168.1.10:3000", "192.168.1.10:3000"))).toBe(true);
    expect(isSameOrigin(fake("http://evil.test:3000", "evil.test:3000"))).toBe(false);
  });

  it("follows PORT", () => {
    vi.stubEnv("PORT", "4000");
    expect(isSameOrigin(fake("http://localhost:4000", "localhost:4000"))).toBe(true);
    // `localhost` with no port means 4000 here, and the origin names it too.
    expect(isSameOrigin(fake("http://localhost:3000", "localhost:3000"))).toBe(false);
  });
});

describe("isAllowedHost", () => {
  it("allows the loopback names and nothing else by default", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
      expect(isAllowedHost(fake(null, host))).toBe(true);
    }
    expect(isAllowedHost(fake(null, "evil.test:3000"))).toBe(false);
    expect(isAllowedHost(fake(null, "10.0.0.5:3000"))).toBe(false);
  });

  it("rejects a request with no Host at all", () => {
    expect(isAllowedHost(fake(null, ""))).toBe(false);
  });

  it("lists the loopback hosts it serves", () => {
    expect(allowedHosts()).toEqual(
      expect.arrayContaining(["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]),
    );
  });

  it("accepts any name on its port when the operator bound every interface", () => {
    // `OPENEXPERT_HOST=0.0.0.0` is the documented way to expose the app; at that
    // point the operator owns the decision and there is no name to allow.
    vi.stubEnv("OPENEXPERT_HOST", "0.0.0.0");
    expect(isAllowedHost(fake(null, "192.168.1.10:3000"))).toBe(true);
    expect(isAllowedHost(fake(null, "192.168.1.10:4000"))).toBe(false);
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
