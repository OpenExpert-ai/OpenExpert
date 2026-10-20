// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// The action itself succeeds in Drive; what fails is the audit row. That used to be swallowed by
// `.catch(() => {})`, so a real write left no event in the activity trail *and* no trace of why.
vi.mock("../drive.server", () => ({
  createFile: vi.fn(async () => ({
    id: "doc-1",
    name: "Informe",
    mimeType: "text/markdown",
    modifiedTime: "2026-01-01",
    webViewLink: "https://drive.google.com/doc-1",
  })),
}));

vi.mock("../ee.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ee.server")>();
  return {
    ...actual,
    logActivity: vi.fn(async () => {
      throw new Error("database is locked");
    }),
  };
});

type Executable = { execute: (input: unknown) => Promise<Record<string, unknown>> };

async function driveTool() {
  const { createChatTools } = await import("./tools");
  const tools = createChatTools({
    expert: { name: "General", sources: ["gdrive"] },
    expertId: "general",
    used: new Set<string>(),
    allowed: () => true,
    proposePending: async (_domain, title, risk, items) => ({
      eventId: "evt_test",
      title,
      risk,
      items,
      status: "pending" as const,
    }),
  });
  return (tools.create_drive_file as unknown as Executable).execute;
}

describe("audit failures", () => {
  let errorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    // `logger.error` is a JSON line on stderr; error level so nothing else is captured.
    process.env["OPENEXPERT_LOG_LEVEL"] = "error";
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    delete process.env["OPENEXPERT_LOG_LEVEL"];
  });

  it("logs the failure with the tool and the Expert instead of staying silent", async () => {
    const exec = await driveTool();
    const out = await exec({ name: "Informe", content: "# hola", kind: "markdown" });

    // The Drive write still reports success to the model...
    expect(out["action"]).toBe("created");
    // ...and the lost audit row is now visible, with context, in the log.
    const line = errorSpy.mock.calls
      .map((call) => String(call[0]))
      .find((text) => text.includes("activity.log_failed"));
    expect(line).toBeTruthy();
    expect(line).toContain('"tool":"create_drive_file"');
    expect(line).toContain('"expertId":"general"');
    expect(line).toContain("database is locked");
  });
});
