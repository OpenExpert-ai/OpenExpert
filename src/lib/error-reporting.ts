// SPDX-License-Identifier: MIT
// Error-boundary reporting.
//
// Logs to the console and forwards to a pluggable reporter when one is
// installed on `window.__OPENEXPERT_ERROR_REPORTER__`. The app works
// standalone; wire your own tracker by assigning an object with a
// `captureException` method, without touching the error boundary.
// No vendor SDK is imported here.

export interface ErrorReporter {
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    __OPENEXPERT_ERROR_REPORTER__?: ErrorReporter;
  }
}

export function reportAppError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  // Loaders and server fns commonly throw a raw Response; String(it) is the
  // opaque "[object Response]", so pull out the status and URL instead.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[error] ${window.location.pathname}`, message, stack ?? "", context);
  window.__OPENEXPERT_ERROR_REPORTER__?.captureException(error, {
    source: "react_error_boundary",
    route: window.location.pathname,
    ...context,
  });
}
