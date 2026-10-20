// SPDX-License-Identifier: MIT
// Server-only HTTP helpers shared by the file-based API routes. Server
// functions get CSRF protection from `src/start.ts`; the `/api/*` routes do
// not, so they validate the request origin explicitly.

const DEFAULT_PORT = 3000;

/** The port the app serves on: `PORT`, and 3000 by default (Drive's redirect pins it). */
function listenPort(): number {
  const port = Number(process.env["PORT"] ?? DEFAULT_PORT);
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : DEFAULT_PORT;
}

/** `host[:port]` in one shape, so `localhost` and `localhost:3000` compare as the same host. */
function normalizeHost(value: string | null): string | null {
  if (!value) return null;
  const text = value.trim().toLowerCase().replace(/\.$/, "");
  if (!text) return null;
  const match = text.startsWith("[")
    ? /^(\[[^\]]+\])(?::(\d+))?$/.exec(text)
    : /^([^:]+)(?::(\d+))?$/.exec(text);
  if (!match) return null;
  const hostname = match[1];
  const port = match[2] ? Number(match[2]) : listenPort();
  return `${hostname}:${port}`;
}

/**
 * The hosts this server answers to. Derived from its own configuration — the
 * loopback names plus whatever `OPENEXPERT_HOST`/`HOST` told it to listen on —
 * and never from the `Host` a request claims, which is exactly what a DNS
 * rebinding attack controls.
 */
export function allowedHosts(): string[] {
  const hosts = new Set<string>();
  for (const name of ["localhost", "127.0.0.1", "[::1]"]) {
    const host = normalizeHost(name);
    if (host) hosts.add(host);
  }
  const configured = (process.env["OPENEXPERT_HOST"] ?? process.env["HOST"] ?? "").trim();
  // A wildcard is a deliberate decision to answer on every interface: there is
  // no hostname to allow in advance, so every `Host` on the configured port is
  // accepted and the operator is the one who opened the door.
  if (configured !== "0.0.0.0" && configured !== "::") {
    const host = normalizeHost(configured);
    if (host) hosts.add(host);
  }
  return [...hosts];
}

/**
 * Whether the request names a host this server was configured to serve. A
 * request for `evil.test:3000` — resolved to loopback by the attacker's DNS —
 * fails here even though its `Origin` matches its own `Host`.
 */
export function isAllowedHost(request: Request): boolean {
  // The header is the normal source; a constructed `Request` (tests, an
  // HTTP/1.0 client) may not carry one, and then the URL — built from the same
  // header by the server — stands in. Neither is trusted: both go through the
  // allowlist.
  let value = request.headers.get("host");
  if (!value) {
    try {
      value = new URL(request.url).host;
    } catch {
      return false;
    }
  }
  const host = normalizeHost(value);
  if (!host) return false;
  if (allowedHosts().includes(host)) return true;
  const configured = (process.env["OPENEXPERT_HOST"] ?? process.env["HOST"] ?? "").trim();
  if (configured === "0.0.0.0" || configured === "::") {
    // Wildcard binding: any name on our port, as documented above.
    return host.endsWith(`:${listenPort()}`);
  }
  return false;
}

/**
 * True when the request is same-origin. Both the `Host` and the `Origin` have
 * to name a host this server serves: comparing the two against each other let
 * `evil.test` through when it resolved to `127.0.0.1`.
 *
 * A request with no `Origin` is a top-level navigation or a non-browser client,
 * not a cross-site fetch: browsers send `Origin` on every request with side
 * effects. Only safe methods are let through without one.
 */
export function isSameOrigin(request: Request): boolean {
  if (!isAllowedHost(request)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return request.method === "GET" || request.method === "HEAD";
  try {
    const originHost = normalizeHost(new URL(origin).host);
    return originHost !== null && allowedHosts().includes(originHost);
  } catch {
    return false;
  }
}

export const forbidden = () => new Response("Forbidden", { status: 403 });

/**
 * `fetch` with a hard deadline. Node's fetch (undici) has no request timeout of
 * its own: a provider that accepts the connection and never answers leaves the
 * chat turn streaming forever, and the user has to press Stop without knowing
 * why. `service` names the caller so the failure says what hung and for how long.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  opts: { service: string; timeoutMs?: number },
): Promise<Response> {
  const { service, timeoutMs = 20_000 } = opts;
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "TimeoutError" || name === "AbortError") {
      const limit = timeoutMs >= 1_000 ? `${Math.round(timeoutMs / 1_000)} s` : `${timeoutMs} ms`;
      throw new Error(`${service} no respondió en ${limit}. Comprueba tu conexión o el proxy.`, {
        cause: e,
      });
    }
    throw e;
  }
}

/** Security headers applied to every response (see `src/server.ts`). */
export function securityHeaders(isProduction: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
  if (isProduction) {
    // The app ships a small inline theme script, hence 'unsafe-inline' for
    // scripts. Everything else is first-party except the optional Google Drive
    // Picker, which the browser loads from apis.google.com and renders in an
    // iframe served by docs.google.com / content.googleapis.com.
    headers["Content-Security-Policy"] = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.googleusercontent.com https://*.gstatic.com https://*.google.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://apis.google.com https://content.googleapis.com https://www.googleapis.com https://docs.google.com https://*.googleusercontent.com",
      "frame-src https://docs.google.com https://drive.google.com https://content.googleapis.com https://*.googleusercontent.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
  }
  return headers;
}
