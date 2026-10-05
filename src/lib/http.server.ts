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
