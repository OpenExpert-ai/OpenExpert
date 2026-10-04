// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-test-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

describe("local workspace", () => {
  it("seeds example experts, processes and integrations", async () => {
    const lw = await import("./local-workspace.server");
    const ws = lw.localWorkspace();
    expect(ws.meId).toBe("local-owner");
    expect(ws.experts.map((e) => e["id"])).toEqual(
      expect.arrayContaining(["general", "ventas", "finanzas", "marketing"]),
    );
    expect(ws.processes.length).toBeGreaterThan(0);
    expect(ws.integrations.length).toBe(8);
    expect(ws.users[0]?.["role"]).toBe("ADMIN");
  });

  it("creates an expert and logs activity", async () => {
    const lw = await import("./local-workspace.server");
    const id = lw.localCreateExpert({ name: "Operaciones", description: "ops", sources: [] });
    expect(id.startsWith("operaciones-")).toBe(true);
    const ws = lw.localWorkspace();
    expect(ws.experts.some((e) => e["id"] === id)).toBe(true);
    expect(
      ws.activity.some(
        (a) => (a as Record<string, unknown>)["summary"] === 'Creado Experto "Operaciones"',
      ),
    ).toBe(true);
  });

  it("toggles a process", async () => {
    const lw = await import("./local-workspace.server");
    const before = lw.localWorkspace().processes[0]!;
    lw.localToggleProcess(before["id"] as string);
    const after = lw.localWorkspace().processes.find((p) => p["id"] === before["id"])!;
    expect(after["active"]).toBe(!before["active"]);
  });

  it("stores and clears conversations", async () => {
    const lw = await import("./local-workspace.server");
    lw.appendLocalRows("chat_messages", [
      {
        user_id: "local-owner",
        expert_id: "general",
        conversation_id: "c1",
        message: { role: "user", parts: [{ type: "text", text: "hola" }] },
        created_at: new Date().toISOString(),
      },
    ]);
    const convs = lw.localConversations("general");
    expect(convs.some((c) => c.id === "c1")).toBe(true);
    expect(JSON.parse(lw.localChat("general", "c1")).length).toBe(1);
    lw.localClearChat("general", "c1");
    expect(JSON.parse(lw.localChat("general", "c1")).length).toBe(0);
  });
});
