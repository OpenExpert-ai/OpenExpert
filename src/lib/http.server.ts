// SPDX-License-Identifier: MIT
// Server-only HTTP helpers shared by the file-based API routes. Server
// functions get CSRF protection from `src/start.ts`; the `/api/*` routes do
// not, so they validate the request origin explicitly.

/** True when the request is same-origin (or not a browser request at all). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
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
