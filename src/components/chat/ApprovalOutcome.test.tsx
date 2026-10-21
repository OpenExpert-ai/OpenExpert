// @vitest-environment jsdom
// SPDX-License-Identifier: MIT
// `approval-responded` is the state of *any* answer to an approval request, not
// only of a denial: the decision lives in `approval.approved`
// (`node_modules/ai/dist/index.d.ts`, `approval-responded` variant). Painting
// that state as "denied" told the user the opposite of what they had just
// decided, for as long as the approved tool took to run.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n", () => ({
  useT: () => ({ t: (s: string) => s, locale: "es" as const }),
}));

import { approvalVerdict, type ApprovalPart } from "./approval";
import { ApprovalOutcome } from "./ApprovalOutcome";

const part = (over: Partial<ApprovalPart> = {}): ApprovalPart => ({
  type: "tool-create_local_file",
  state: "approval-responded",
  ...over,
});

describe("approvalVerdict", () => {
  it("reads the decision from approval.approved, not from the state", () => {
    expect(approvalVerdict(part({ approval: { id: "a1", approved: true } }))).toBe("approved");
    expect(approvalVerdict(part({ approval: { id: "a1", approved: false } }))).toBe("denied");
  });

  it("treats output-denied as denied whatever the approval says", () => {
    expect(
      approvalVerdict(part({ state: "output-denied", approval: { id: "a1", approved: true } })),
    ).toBe("denied");
  });

  it("has no verdict for states that are not a decision, or for a missing decision", () => {
    expect(approvalVerdict(part({ state: "approval-requested" }))).toBeNull();
    expect(approvalVerdict(part({ state: "output-available" }))).toBeNull();
    expect(approvalVerdict(part())).toBeNull();
  });
});

describe("ApprovalOutcome", () => {
  afterEach(cleanup);

  it("says the approved write is running instead of calling it denied", () => {
    render(<ApprovalOutcome part={part({ approval: { id: "a1", approved: true } })} />);

    expect(screen.getByText("Aprobado. Escribiendo el archivo…")).toBeTruthy();
    expect(screen.queryByText(/denegad/i)).toBeNull();
  });

  it("keeps saying denied when the decision was no", () => {
    render(<ApprovalOutcome part={part({ approval: { id: "a1", approved: false } })} />);

    expect(screen.getByText("Escritura local denegada")).toBeTruthy();
    expect(screen.queryByText(/aprobad/i)).toBeNull();
  });

  it("keeps saying denied when the tool output was denied", () => {
    render(
      <ApprovalOutcome
        part={part({
          type: "tool-create_notion_page",
          state: "output-denied",
          approval: { id: "a1", approved: false },
        })}
      />,
    );

    expect(screen.getByText("Escritura en Notion denegada")).toBeTruthy();
  });

  it("names the integration for an approved Drive call", () => {
    render(
      <ApprovalOutcome
        part={part({
          type: "tool-search_drive",
          approval: { id: "a1", approved: true },
        })}
      />,
    );

    expect(screen.getByText("Aprobado. Consultando Google Drive…")).toBeTruthy();
  });

  it("names the integration for a denied Drive call", () => {
    render(
      <ApprovalOutcome
        part={part({
          type: "tool-create_drive_file",
          approval: { id: "a1", approved: false },
        })}
      />,
    );

    expect(screen.getByText("Acceso a Google Drive denegado")).toBeTruthy();
  });

  it("renders nothing while the request is still pending or already answered", () => {
    const { container: pending } = render(
      <ApprovalOutcome part={part({ state: "approval-requested" })} />,
    );
    const { container: available } = render(
      <ApprovalOutcome part={part({ state: "output-available" })} />,
    );

    expect(pending.firstChild).toBeNull();
    expect(available.firstChild).toBeNull();
  });
});
