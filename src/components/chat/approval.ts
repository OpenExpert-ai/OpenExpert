// SPDX-License-Identifier: MIT
// The slice of a tool part the approval banner needs, and the decision it
// carries. It lives apart from the component so the component file exports
// only components (react-refresh) and the rule can be unit-tested on its own.

/** The fields of a tool part that say what the user answered, if anything. */
export type ApprovalPart = {
  type: string;
  state: string;
  approval?: { id?: string; approved?: boolean };
};

/**
 * What the user answered, or `null` when the part is not a decision.
 *
 * `approval-responded` is the state of any answer — the SDK reports the
 * decision in `approval.approved` (`ai/dist/index.d.ts`) — so the state alone
 * does not say whether the call was approved or denied: an approved call sits
 * in that state while the tool runs.
 */
export function approvalVerdict(part: ApprovalPart): "approved" | "denied" | null {
  if (part.state === "output-denied") return "denied";
  if (part.state !== "approval-responded") return null;
  if (part.approval?.approved === true) return "approved";
  if (part.approval?.approved === false) return "denied";
  // No decision recorded: saying «denied» would be a claim we cannot back.
  return null;
}
