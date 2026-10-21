// SPDX-License-Identifier: MIT
// The chat turn has to end when the provider accepts the connection and never
// answers: Node's `fetch` has no deadline of its own, so the turn used to spin
// until the user pressed Stop. The first test talks to a real local server that
// never replies and checks both the cut and the message the interface gets; the
// others cover the deadline value and the abort-to-error rewrite.
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UIMessageChunk } from "ai";
import { MAX_TIMEOUT_MS } from "../python.server";
import {
  deadlineAsError,
  deadlineMessage,
  isDeadlineAbort,
  STEP_DEADLINE_MS,
  stepDeadlineMs,
} from "./deadline";

const DEADLINE_MS = 1_500;
const ENV_VARS = [
  "OPENEXPERT_DATA_DIR",
  "OPENEXPERT_MODEL_PROVIDER",
  "OPENEXPERT_MODEL_ID",
  "OPENEXPERT_MODEL_KEY",
  "OPENEXPERT_BASE_URL",
  "OPENEXPERT_CHAT_TIMEOUT_MS",
] as const;

let dir: string;
let server: Server;
const saved = new Map<string, string | undefined>();

beforeAll(async () => {
  for (const name of ENV_VARS) saved.set(name, process.env[name]);
  dir = mkdtempSync(join(tmpdir(), "openexpert-chat-deadline-"));
  // Accepts the request and never answers: no headers, no body, no end.
  server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  process.env["OPENEXPERT_DATA_DIR"] = dir;
  process.env["OPENEXPERT_MODEL_PROVIDER"] = "openai-compatible";
  process.env["OPENEXPERT_MODEL_ID"] = "test-model";
  process.env["OPENEXPERT_MODEL_KEY"] = "test-key";
  process.env["OPENEXPERT_BASE_URL"] = `http://127.0.0.1:${port}/v1`;
  process.env["OPENEXPERT_CHAT_TIMEOUT_MS"] = String(DEADLINE_MS);
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
  rmSync(dir, { recursive: true, force: true });
  for (const name of ENV_VARS) {
    const before = saved.get(name);
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
});

/** A chunk stream the deadline rewrite can be exercised with. */
function chunks(...items: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const item of items) controller.enqueue(item);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const out: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(value);
  }
  return out;
}

describe("chat turn deadline", () => {
  it("cuts a provider that accepts and never answers, and says why", async () => {
    const { handleChat } = await import("./chat.server");
    const started = Date.now();
    const response = await handleChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          expertId: "ventas",
          messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hola" }] }],
        }),
      }),
    );
    const body = await response.text();
    const elapsed = Date.now() - started;

    // The turn ended on its own, inside the deadline, instead of waiting for
    // the user to press Stop.
    expect(elapsed).toBeGreaterThanOrEqual(DEADLINE_MS - 50);
    expect(elapsed).toBeLessThan(DEADLINE_MS * 4);
    // And it ended with an error the interface can show, not a silent abort.
    expect(body).toContain("El proveedor de IA no respondió");
    expect(body).toContain("el turno se ha cortado");
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('"type":"abort"');
  }, 20_000);
});

describe("deadline value", () => {
  it("defaults to a bound that leaves room for the slowest tool", () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(stepDeadlineMs(env)).toBe(STEP_DEADLINE_MS);
    // `run_python` can spend 120 s inside a step, so the deadline must outlast it.
    expect(stepDeadlineMs(env)).toBeGreaterThan(MAX_TIMEOUT_MS);
  });

  it("reads the override and clamps it on both sides", () => {
    expect(stepDeadlineMs({ OPENEXPERT_CHAT_TIMEOUT_MS: "5000" })).toBe(5_000);
    // A stray zero or a negative would remove the deadline altogether.
    expect(stepDeadlineMs({ OPENEXPERT_CHAT_TIMEOUT_MS: "0" })).toBe(STEP_DEADLINE_MS);
    expect(stepDeadlineMs({ OPENEXPERT_CHAT_TIMEOUT_MS: "abc" })).toBe(STEP_DEADLINE_MS);
    expect(stepDeadlineMs({ OPENEXPERT_CHAT_TIMEOUT_MS: "10" })).toBe(1_000);
    expect(stepDeadlineMs({ OPENEXPERT_CHAT_TIMEOUT_MS: "99999999" })).toBe(900_000);
    expect(stepDeadlineMs({ OPENEXPERT_CHAT_TIMEOUT_MS: "7500.9" })).toBe(7_500);
  });
});

describe("deadline abort rewrite", () => {
  it("turns the SDK deadline abort into an error the interface can show", async () => {
    const out = await collect(
      deadlineAsError(
        chunks(
          { type: "start" },
          { type: "abort", reason: "TimeoutError: Step timeout of 1500ms exceeded" },
        ),
        DEADLINE_MS,
      ),
    );
    expect(out.at(-1)).toEqual({ type: "error", errorText: deadlineMessage(DEADLINE_MS) });
    expect(JSON.stringify(out)).not.toContain('"abort"');
  });

  it("leaves a Stop from the user, and the rest of the stream, untouched", async () => {
    const stream = chunks(
      { type: "start" },
      { type: "abort", reason: "AbortError: The operation was aborted." },
    );
    const out = await collect(deadlineAsError(stream, DEADLINE_MS));
    expect(out).toEqual([
      { type: "start" },
      { type: "abort", reason: "AbortError: The operation was aborted." },
    ]);
  });

  it("only treats a TimeoutError reason as the deadline", () => {
    expect(isDeadlineAbort("TimeoutError: Step timeout of 1500ms exceeded")).toBe(true);
    expect(isDeadlineAbort("TimeoutError: The operation was aborted due to timeout")).toBe(true);
    expect(isDeadlineAbort("AbortError: The operation was aborted.")).toBe(false);
    expect(isDeadlineAbort("TimeoutErrorish")).toBe(false);
    expect(isDeadlineAbort(undefined)).toBe(false);
  });
});
