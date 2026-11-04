// SPDX-License-Identifier: MIT
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { isAllowedHost, securityHeaders } from "./lib/http.server";
import { logger } from "./lib/logger.server";
import { APP_VERSION } from "./lib/version";
import { DataDirectoryBusyError } from "./lib/data-lock.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  requestId: string,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  logger.error("ssr.swallowed", consumeLastCapturedError() ?? new Error(body), { requestId });
  return new Response(renderErrorPage(requestId), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const requestId = crypto.randomUUID();
    try {
      // A `Host` this server was not configured to serve is a DNS rebinding
      // attempt (or a misdirected request): refuse it before any handler sees
      // it. The TanStack CSRF middleware compares Origin with the request URL,
      // which under rebinding are both the attacker's host.
      if (!isAllowedHost(request)) {
        logger.warn("http.host", {
          requestId,
          host: request.headers.get("host") ?? "",
        });
        return applySecurityHeaders(new Response("Forbidden", { status: 403 }), requestId);
      }
      // Acquire ownership before any route can modify settings, credentials or
      // the database. Loading db.server also applies the file configuration.
      const { acquireDataDirectory } = await import("./lib/db.server");
      acquireDataDirectory();
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return applySecurityHeaders(
        await normalizeCatastrophicSsrResponse(response, requestId),
        requestId,
      );
    } catch (error) {
      if (error instanceof DataDirectoryBusyError) {
        return applySecurityHeaders(
          new Response(error.message, {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" },
          }),
          requestId,
        );
      }
      logger.error("ssr.unhandled", error, { requestId, path: new URL(request.url).pathname });
      return applySecurityHeaders(
        new Response(renderErrorPage(requestId), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        requestId,
      );
    }
  },
};

function applySecurityHeaders(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  headers.set("x-openexpert-version", APP_VERSION);
  for (const [name, value] of Object.entries(
    securityHeaders(process.env["NODE_ENV"] === "production"),
  )) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
