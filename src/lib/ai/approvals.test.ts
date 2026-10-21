// SPDX-License-Identifier: MIT
// Regression tests for the human-approval gate on the write tools. The gate is
// the AI SDK's native approval: `chat.server.ts` maps every name in
// `APPROVAL_REQUIRED` to "user-approval", the SDK pauses the turn, the UI asks,
// and only an approval response runs `execute`. The model is mocked, so no
// provider is used.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertToModelMessages, generateText, type UIMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { APPROVAL_REQUIRED, createChatTools } from "./tools";

const localFs = vi.hoisted(() => ({
  createLocalFile: vi.fn(() => ({ name: "facturas.xlsx", path: "/tmp/facturas.xlsx" })),
  writeLocalFile: vi.fn(() => ({ name: "facturas.xlsx", path: "/tmp/facturas.xlsx" })),
  readLocalFile: vi.fn(),
  searchLocalContent: vi.fn(),
}));
vi.mock("../local-fs.server", () => localFs);

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-approvals-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

/** A model that asks for one tool call and then stops. */
function modelCalling(toolName: string, input: unknown) {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [
        { type: "tool-call", toolCallId: "call-1", toolName, input: JSON.stringify(input) },
      ],
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage,
      warnings: [],
    },
  });
}

function catalog() {
  return createChatTools({
    expert: { name: "Local", sources: ["local", "notion", "gdrive"] },
    expertId: "local",
    used: new Set<string>(),
    allowed: () => true,
    proposePending: vi.fn(),
  });
}

/** Exactly what `chat.server.ts` hands to `streamText`. */
const approvalMap = () =>
  Object.fromEntries(APPROVAL_REQUIRED.map((name) => [name, "user-approval" as const]));

describe("APPROVAL_REQUIRED", () => {
  it("covers every tool in the catalog that writes something", () => {
    const writes = Object.keys(catalog()).filter((name) => /^(create|update|append)_/.test(name));
    expect(writes.length).toBe(7);
    for (const name of writes) expect(APPROVAL_REQUIRED).toContain(name);
  });

  it("lists only tools that exist", () => {
    const names = Object.keys(catalog());
    for (const name of APPROVAL_REQUIRED) expect(names).toContain(name);
  });
});

describe("human approval on the write tools", () => {
  it("does not run create_local_file before the user answers", async () => {
    const tools = catalog();
    const result = await generateText({
      model: modelCalling("create_local_file", {
        folder: "/tmp",
        name: "facturas.xlsx",
        content: "hola",
      }),
      tools,
      toolApproval: approvalMap(),
      prompt: "crea facturas.xlsx",
    });

    // The turn stopped at the approval request: nothing was written.
    expect(localFs.createLocalFile).not.toHaveBeenCalled();
    const request = result.content.find((p) => p.type === "tool-approval-request");
    expect(request).toBeDefined();
  });

  it("runs the tool once the same call is approved", async () => {
    const tools = catalog();
    const pending = await generateText({
      model: modelCalling("create_local_file", {
        folder: "/tmp",
        name: "facturas.xlsx",
        content: "hola",
      }),
      tools,
      toolApproval: approvalMap(),
      prompt: "crea facturas.xlsx",
    });
    const request = pending.content.find((p) => p.type === "tool-approval-request");
    if (!request) throw new Error("no approval request");

    // The continuation carries the assistant message the UI built from that
    // request plus the user's decision; the SDK validates the pair.
    await generateText({
      model: new MockLanguageModelV3({
        doGenerate: {
          content: [{ type: "text", text: "hecho" }],
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          warnings: [],
        },
      }),
      tools,
      toolApproval: approvalMap(),
      messages: await convertToModelMessages([
        { id: "u1", role: "user", parts: [{ type: "text", text: "crea facturas.xlsx" }] },
        {
          id: "a1",
          role: "assistant",
          parts: [
            {
              type: "tool-create_local_file",
              toolCallId: "call-1",
              state: "approval-responded",
              input: { folder: "/tmp", name: "facturas.xlsx", content: "hola" },
              approval: { id: request.approvalId, approved: true },
            },
          ],
        },
      ] as UIMessage[]),
    });

    expect(localFs.createLocalFile).toHaveBeenCalledTimes(1);
  });

  it("no ejecuta la herramienta si la llamada ya trae su resultado", async () => {
    // Lo que hace el servidor cuando una pestaña vieja repite la aprobación: la
    // respuesta se sustituye por el resultado que ya está guardado
    // (`approval-history.ts`). Con el resultado delante, el SDK no vuelve a
    // ejecutar la herramienta; eso es lo que impide duplicar una página de
    // Notion o reescribir dos veces un archivo de Drive.
    localFs.createLocalFile.mockClear();
    const tools = catalog();
    await generateText({
      model: new MockLanguageModelV3({
        doGenerate: {
          content: [{ type: "text", text: "ya estaba hecho" }],
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          warnings: [],
        },
      }),
      tools,
      toolApproval: approvalMap(),
      messages: await convertToModelMessages([
        { id: "u1", role: "user", parts: [{ type: "text", text: "crea facturas.xlsx" }] },
        {
          id: "a1",
          role: "assistant",
          parts: [
            {
              type: "tool-create_local_file",
              toolCallId: "call-1",
              state: "output-available",
              input: { folder: "/tmp", name: "facturas.xlsx", content: "hola" },
              approval: { id: "ap-1", approved: true },
              output: { name: "facturas.xlsx", path: "/tmp/facturas.xlsx" },
            },
          ],
        },
      ] as UIMessage[]),
    });

    expect(localFs.createLocalFile).not.toHaveBeenCalled();
  });
});
