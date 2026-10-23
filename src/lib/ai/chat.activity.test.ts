// SPDX-License-Identifier: MIT
// What a chat turn leaves in the audit trail.
//
// `onEnd` of the UI stream fires the same way for a turn that answered and for
// one the deadline cut, and the handler wrote `status: "ok"` without looking at
// why it had ended: a provider that accepts the connection and never answers
// left a row in the activity log saying the query went fine, and an `assistant`
// message with no parts in the history. The audit log is where the owner looks
// when something went wrong, so the row has to say what happened, and a turn
// that produced no reply is not a turn that gets stored.
//
// Both paths are covered here against the real `handleChat`: one local server
// that accepts and never answers, and one that answers like an
// OpenAI-compatible provider.
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DEADLINE_MS = 1_500;
const ENV_VARS = [
  "OPENEXPERT_DATA_DIR",
  "OPENEXPERT_MODEL_PROVIDER",
  "OPENEXPERT_MODEL_ID",
  "OPENEXPERT_MODEL_KEY",
  "OPENEXPERT_BASE_URL",
  "OPENEXPERT_CHAT_TIMEOUT_MS",
] as const;

/** What the interface is told when the provider ran out of time. */
const CUT_TEXT = "El proveedor de IA no respondió";

let dir: string;
let silent: Server;
let answering: Server;
let silentUrl: string;
let answeringUrl: string;
const saved = new Map<string, string | undefined>();

/**
 * A Responses-API event stream carrying one sentence. `createOpenAI`'s default
 * model speaks the Responses API, not Chat Completions, so the double has to
 * speak it too.
 */
function sse(text: string): string {
  const event = (payload: Record<string, unknown>) => `data: ${JSON.stringify(payload)}\n\n`;
  const message = {
    id: "msg_test",
    type: "message",
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text, annotations: [] }],
  };
  return [
    event({
      type: "response.created",
      response: { id: "resp_test", created_at: 1_700_000_000, model: "test-model" },
    }),
    event({
      type: "response.output_item.added",
      output_index: 0,
      item: {
        id: "msg_test",
        type: "message",
        status: "in_progress",
        role: "assistant",
        content: [],
      },
    }),
    event({
      type: "response.output_text.delta",
      item_id: "msg_test",
      output_index: 0,
      delta: text,
    }),
    event({
      type: "response.output_text.done",
      item_id: "msg_test",
      output_index: 0,
      text,
    }),
    event({ type: "response.output_item.done", output_index: 0, item: message }),
    event({
      type: "response.completed",
      response: {
        id: "resp_test",
        status: "completed",
        output: [message],
        usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
      },
    }),
  ].join("");
}

beforeAll(async () => {
  for (const name of ENV_VARS) saved.set(name, process.env[name]);
  dir = mkdtempSync(join(tmpdir(), "openexpert-chat-activity-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
  process.env["OPENEXPERT_MODEL_PROVIDER"] = "openai-compatible";
  process.env["OPENEXPERT_MODEL_ID"] = "test-model";
  process.env["OPENEXPERT_MODEL_KEY"] = "test-key";
  process.env["OPENEXPERT_CHAT_TIMEOUT_MS"] = String(DEADLINE_MS);

  // Accepts the request and never answers: no headers, no body, no end.
  silent = createServer(() => {});
  await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
  silentUrl = `http://127.0.0.1:${(silent.address() as { port: number }).port}/v1`;

  answering = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.end(sse("Hola desde el doble."));
    });
  });
  await new Promise<void>((resolve) => answering.listen(0, "127.0.0.1", resolve));
  answeringUrl = `http://127.0.0.1:${(answering.address() as { port: number }).port}/v1`;
});

afterAll(() => {
  for (const server of [silent, answering]) {
    server.closeAllConnections();
    server.close();
  }
  rmSync(dir, { recursive: true, force: true });
  for (const name of ENV_VARS) {
    const before = saved.get(name);
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
});

type ActivityRow = { type: string; status: string; summary: string; durationMs: number | null };
type StoredMessage = { role?: string; parts?: { type?: string }[] };

/** The activity rows logged, and the messages kept, by one turn. */
async function turn(baseUrl: string, expertId: string) {
  process.env["OPENEXPERT_BASE_URL"] = baseUrl;
  const { getDb } = await import("../db.server");
  const schema = await import("../../../drizzle/schema");
  const { handleChat } = await import("./chat.server");
  const { orm } = await getDb();
  const rowsBefore = orm.select().from(schema.activity).all().length;

  const response = await handleChat(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        expertId,
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hola" }] }],
      }),
    }),
  );
  const body = await response.text();
  // `onEnd` persists through its own promises; the stream closes before the
  // insert is durable.
  await new Promise((resolve) => setTimeout(resolve, 400));

  const activity = orm.select().from(schema.activity).all().slice(rowsBefore) as ActivityRow[];
  const messages = orm
    .select()
    .from(schema.chatMessages)
    .all()
    .filter((row) => row.expertId === expertId)
    .map((row) => row.message as StoredMessage);
  return { body, activity, messages };
}

const textOf = (message: StoredMessage) =>
  (message.parts ?? []).map((part) => part.type).filter((type) => type === "text").length;

describe("a turn the deadline cut", () => {
  it("is filed as a failure that says why, and leaves no empty reply behind", async () => {
    const { body, activity, messages } = await turn(silentUrl, "ventas");

    // The user was told why the turn stopped.
    expect(body).toContain(CUT_TEXT);

    // The audit row says the query did not succeed, and names the reason. It
    // used to say "ok", which is the bug: the row looked like a good turn.
    expect(activity).toHaveLength(1);
    const [row] = activity as [ActivityRow];
    expect(row.type).toBe("Consulta");
    expect(row.status).not.toBe("ok");
    expect(row.status).toBe("failed");
    expect(row.summary).toContain("Consulta: hola");
    expect(row.summary).toContain("no respondió en 2 s");
    expect(row.durationMs).toBeGreaterThanOrEqual(DEADLINE_MS - 50);

    // The user's message was stored; the reply that never existed was not.
    expect(messages.map((m) => m.role)).toEqual(["user"]);
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(0);
  }, 20_000);
});

describe("a turn that answers", () => {
  it("is still filed as ok, with its duration, and its reply is stored", async () => {
    const { body, activity, messages } = await turn(answeringUrl, "general");

    expect(body).toContain("Hola desde el doble.");
    expect(activity).toHaveLength(1);
    const [row] = activity as [ActivityRow];
    expect(row.type).toBe("Consulta");
    expect(row.status).toBe("ok");
    expect(row.summary).toBe("Consulta: hola");
    expect(row.durationMs).toBeGreaterThanOrEqual(0);

    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    const assistant = messages[1] as StoredMessage;
    expect(textOf(assistant)).toBe(1);
    expect(JSON.stringify(assistant)).toContain("Hola desde el doble.");
  }, 20_000);
});
