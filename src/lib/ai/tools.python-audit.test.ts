// SPDX-License-Identifier: MIT
// The script is the audit record: `run_python` logs it to the activity trail so that "what did it
// actually run?" has an answer afterwards. `tools.ts` logs `code.slice(0, 4000)` and says nothing
// about the cut, so a script longer than that is recorded half — and the schema of the tool itself
// accepts up to 20 000 characters.
import { beforeEach, describe, expect, it, vi } from "vitest";

type LoggedSnapshot = { script?: string; truncated?: boolean; chars?: number; totalChars?: number };
const logged: { snapshot?: LoggedSnapshot }[] = [];

vi.mock("../ee.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ee.server")>();
  return {
    ...actual,
    logActivity: vi.fn(async (entry: { snapshot?: LoggedSnapshot }) => {
      logged.push(entry);
      return "evt_test";
    }),
  };
});

type Executable = { execute: (input: unknown) => Promise<Record<string, unknown>> };

async function pythonTool() {
  const { createChatTools } = await import("./tools");
  const tools = createChatTools({
    expert: { name: "General", sources: ["python"] },
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
  return (tools.run_python as unknown as Executable).execute;
}

beforeEach(() => {
  logged.length = 0;
});

describe("run_python en la traza de auditoría", () => {
  it("guarda el script entero y no sus primeros 4000 caracteres", async () => {
    const exec = await pythonTool();
    // Past the 4 000-character cut, well under the 20 000 the tool accepts.
    const code = `# marcador de inicio\n${"x = 1\n".repeat(900)}print("final-del-script")\n`;
    expect(code.length).toBeGreaterThan(4_000);
    expect(code.length).toBeLessThan(20_000);

    await exec({ code });

    const snapshot: LoggedSnapshot | undefined = logged.at(-1)?.snapshot;
    expect(snapshot, "run_python no dejó snapshot del script en la actividad").toBeTruthy();
    // The whole script, byte for byte: the trail is what answers what ran.
    expect(snapshot?.script).toBe(code);
    expect(snapshot?.script).toContain("final-del-script");
  });
});
