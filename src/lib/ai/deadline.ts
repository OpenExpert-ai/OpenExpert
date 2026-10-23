// SPDX-License-Identifier: MIT
// The chat turn's deadline, and how its expiry reaches the user.
//
// Node's `fetch` (undici) has no request timeout of its own, and the provider
// adapters hand the turn straight to it: a provider that accepts the connection
// and never answers left the turn streaming until the user pressed Stop. The AI
// SDK closes that hole with its own deadline, but it reports the expiry as an
// `abort` chunk, and the browser drops aborts in silence —the turn just stops—
// so the reason has to become an `error` the interface can show.

import type { UIMessageChunk } from "ai";

/**
 * Deadline for one step of a turn. A step is one model call plus the tools it
 * asks for, so the default has to leave room for the slowest tool: `run_python`
 * runs up to 120 s, and a slow local model can spend a minute before its first
 * token. Four minutes bounds a provider that never answers and still lets a
 * legitimate long turn finish.
 */
export const STEP_DEADLINE_MS = 240_000;

const MIN_DEADLINE_MS = 1_000;
const MAX_DEADLINE_MS = 900_000;

/**
 * The step deadline in force. `OPENEXPERT_CHAT_TIMEOUT_MS` is the escape hatch
 * for a self-hosted model that legitimately takes longer; it is clamped so a
 * stray zero or a huge number cannot remove the deadline altogether.
 */
export function stepDeadlineMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env["OPENEXPERT_CHAT_TIMEOUT_MS"]);
  if (!Number.isFinite(raw) || raw <= 0) return STEP_DEADLINE_MS;
  return Math.min(Math.max(Math.floor(raw), MIN_DEADLINE_MS), MAX_DEADLINE_MS);
}

/** A deadline in the units the interface uses elsewhere. */
export function deadlineLabel(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000} min`;
  return `${Math.round(ms / 1_000)} s`;
}

/** What the user reads when the provider ran out of time. */
export function deadlineMessage(ms: number): string {
  return `El proveedor de IA no respondió en ${deadlineLabel(ms)} y el turno se ha cortado. Comprueba tu conexión o el proveedor configurado.`;
}

/**
 * The SDK's own deadline aborts with a `TimeoutError`; a Stop from the user
 * arrives as an `AbortError`. Only the first one is a failure to report.
 */
export function isDeadlineAbort(reason: string | undefined): boolean {
  return reason != null && /^TimeoutError\b/.test(reason);
}

/**
 * What the audit summary adds when the deadline cut the turn short. Shorter
 * than `deadlineMessage`, which is written for the reader of the broken turn;
 * the log already says which query it was.
 */
export function deadlineNote(ms: number): string {
  return `el proveedor no respondió en ${deadlineLabel(ms)} y el turno se ha cortado`;
}

/**
 * How a turn ended, as the audit trail records it. `onEnd` of the UI stream
 * fires the same way whatever happened to the turn, so the status has to be
 * read from the two signals it does give: whether the stream aborted, and
 * whether the request itself was cancelled — a Stop from the user aborts
 * `request.signal`, while our deadline is the SDK's own timeout and leaves it
 * untouched. A turn that ends any way other than completed is not a correct
 * query, and the log said "ok" for all of them.
 */
export function turnStatus(s: {
  aborted: boolean;
  requestAborted: boolean;
  failed: boolean;
}): "ok" | "cancelled" | "failed" {
  if (s.aborted) return s.requestAborted ? "cancelled" : "failed";
  return s.failed ? "failed" : "ok";
}

/**
 * Rewrites the SDK's deadline abort as an error chunk. Any other abort (the
 * user pressing Stop) travels untouched: that is a cancellation, not a failure.
 */
export function deadlineAsError(
  stream: ReadableStream<UIMessageChunk>,
  timeoutMs: number,
): ReadableStream<UIMessageChunk> {
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (chunk.type === "abort" && isDeadlineAbort(chunk.reason)) {
          controller.enqueue({ type: "error", errorText: deadlineMessage(timeoutMs) });
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}
