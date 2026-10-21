// SPDX-License-Identifier: MIT
// The answer to a write-tool approval lives inside the chat message, so the
// history is the only place that knows a call was already decided. Two readers
// share this module: `chat.server.ts`, before handing the conversation to the
// model (an answered call must not run twice), and `getChat`, when replaying a
// conversation whose pending copy survived next to the result.

/** The slice of a UI message part this module needs. */
export type ApprovalPart = {
  type?: string;
  toolCallId?: string;
  state?: string;
  approval?: { id?: string; approved?: boolean };
  [key: string]: unknown;
};

/** States in which the call is over: it ran, it failed, or the user said no. */
const DECIDED = new Set(["output-available", "output-error", "output-denied"]);

/** Whether a tool part already carries a final outcome. */
export function isDecided(part: ApprovalPart | undefined): boolean {
  return typeof part?.toolCallId === "string" && DECIDED.has(part.state ?? "");
}

/**
 * Final outcome per `toolCallId`, from `messages` in order. A later message
 * wins: the continuation rewrites the call it was asked about.
 */
export function outcomesByCall(messages: readonly unknown[]): Map<string, ApprovalPart> {
  const outcomes = new Map<string, ApprovalPart>();
  for (const message of messages) {
    const parts = (message as { parts?: unknown } | null)?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts as ApprovalPart[]) {
      if (isDecided(part)) outcomes.set(part.toolCallId!, part);
    }
  }
  return outcomes;
}

/**
 * Weighs every open approval in `message` against the outcome already stored
 * for that call. An `approval-requested` part —history written before the
 * decision was saved— becomes the result instead of a live card; an
 * `approval-responded` one —a browser still holding the old conversation that
 * sends the approval again— becomes the result instead of a second execution.
 * Returns the message itself when there is nothing to settle.
 */
export function settleApprovals<T extends { parts?: unknown }>(
  message: T,
  outcomes: Map<string, ApprovalPart>,
): T {
  if (!outcomes.size || !Array.isArray(message.parts)) return message;
  let changed = false;
  const parts = (message.parts as ApprovalPart[]).map((part) => {
    if (part?.state !== "approval-requested" && part?.state !== "approval-responded") return part;
    const settled = typeof part.toolCallId === "string" ? outcomes.get(part.toolCallId) : undefined;
    if (!settled) return part;
    changed = true;
    return settled;
  });
  return changed ? { ...message, parts } : message;
}

/**
 * Settles `messages` against the whole stored conversation (`stored`). Returns
 * the same array when nothing changes, so the common path does not copy the
 * history on every turn.
 */
export function settleHistory<T extends { parts?: unknown }>(
  messages: T[],
  stored: readonly unknown[],
): T[] {
  const outcomes = outcomesByCall(stored);
  if (!outcomes.size) return messages;
  let changed = false;
  const next = messages.map((message) => {
    const settled = settleApprovals(message, outcomes);
    if (settled !== message) changed = true;
    return settled;
  });
  return changed ? next : messages;
}
