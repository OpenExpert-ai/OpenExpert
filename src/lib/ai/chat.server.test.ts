// SPDX-License-Identifier: MIT
// Covers the chat endpoint paths the injection/model-key tests do not reach:
// the model-build failure, the streaming error surface and the persistence in
// onFinish. The provider SDK is mocked, so no network or credentials are used.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { APPROVAL_REQUIRED } from "./tools";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-chat-server-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  convert: vi.fn(),
  getLanguageModel: vi.fn(),
  modelKeyError: vi.fn(),
  selectedProvider: vi.fn(() => "google"),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: mocks.streamText, convertToModelMessages: mocks.convert };
});

vi.mock("@/lib/engine/model-provider.server", () => ({
  getLanguageModel: (...a: unknown[]) => mocks.getLanguageModel(...a),
  modelKeyError: (...a: unknown[]) => mocks.modelKeyError(...a),
  modelLabel: () => "google:test-model",
  selectedProvider: () => mocks.selectedProvider(),
}));

function chatRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    // A real browser fetch sends both: `Host` is the server it dialled,
    // `Origin` the page it is on. The origin check needs them.
    headers: {
      "content-type": "application/json",
      host: "localhost:3000",
      origin: "http://localhost:3000",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const userMessage = (text: string) => ({ id: "m1", role: "user", parts: [{ type: "text", text }] });
const validBody = () => ({
  expertId: "ventas",
  messages: [userMessage("¿Cómo va el pipeline?")],
});

type StreamOpts = {
  onError: (e: unknown) => string;
  onFinish: (a: { responseMessage: unknown }) => Promise<void>;
};

/** A fake streamText result that captures the callbacks handleChat wires up. */
function streamResult() {
  let opts!: StreamOpts;
  const result = {
    toUIMessageStreamResponse: (o: StreamOpts) => {
      opts = o;
      return new Response("streamed", { status: 200 });
    },
  };
  return { result, opts: () => opts };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.modelKeyError.mockReturnValue(null);
  mocks.convert.mockResolvedValue([]);
  mocks.selectedProvider.mockReturnValue("google");
});

describe("handleChat model wiring", () => {
  it("returns 500 with the build error when the model cannot be created", async () => {
    mocks.getLanguageModel.mockImplementation(() => {
      throw new Error("Falta OPENEXPERT_BASE_URL");
    });
    const { handleChat } = await import("./chat.server");
    const res = await handleChat(chatRequest(validBody()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Falta OPENEXPERT_BASE_URL" });
  });

  it("passes a valid turn through to streamText with the tools wired", async () => {
    mocks.getLanguageModel.mockReturnValue({ modelId: "fake" });
    const { result } = streamResult();
    mocks.streamText.mockReturnValue(result);
    const { handleChat } = await import("./chat.server");
    // An expert with no DB row exercises the fallback expert (gdrive source).
    const res = await handleChat(
      chatRequest({ expertId: "experto-inexistente", messages: [userMessage("hola")] }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("streamed");
    expect(mocks.streamText).toHaveBeenCalledTimes(1);

    const args = mocks.streamText.mock.calls[0]?.[0] as Record<string, unknown>;
    // The fallback expert gets the gdrive source, so the Drive block of the
    // system prompt is included.
    expect(String(args["system"])).toContain("GOOGLE DRIVE CONECTADO");
    expect(args["tools"]).toBeTruthy();
    expect(args["toolApproval"]).toEqual(
      Object.fromEntries(APPROVAL_REQUIRED.map((name) => [name, "user-approval"])),
    );
    expect(args["abortSignal"]).toBeDefined();
    // Google provider asks for thinking; other providers get no options.
    expect(args["providerOptions"]).toMatchObject({ google: { thinkingConfig: {} } });
  });

  it("omits provider options for a non-google provider", async () => {
    mocks.getLanguageModel.mockReturnValue({});
    mocks.selectedProvider.mockReturnValue("ollama");
    const { result } = streamResult();
    mocks.streamText.mockReturnValue(result);
    const { handleChat } = await import("./chat.server");
    await handleChat(chatRequest(validBody()));
    const args = mocks.streamText.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args["providerOptions"]).toEqual({});
  });

  it("includes the local and Notion prompt blocks for an expert that lists them", async () => {
    const { getDb, persist } = await import("@/lib/db.server");
    const { raw } = await getDb();
    raw.run(
      "INSERT OR REPLACE INTO experts (id,name,description,sources,domains,created_at) VALUES (?,?,?,?,?,?)",
      ["misc", "Mixto", "", '["gdrive","local","notion"]', "[]", "2026-01-01"],
    );
    await persist();

    mocks.getLanguageModel.mockReturnValue({});
    const { result } = streamResult();
    mocks.streamText.mockReturnValue(result);
    const { handleChat } = await import("./chat.server");
    await handleChat(chatRequest({ expertId: "misc", messages: [userMessage("hola")] }));
    const args = mocks.streamText.mock.calls[0]?.[0] as Record<string, unknown>;
    const system = String(args["system"]);
    expect(system).toContain("ARCHIVOS LOCALES CONECTADOS");
    expect(system).toContain("NOTION CONECTADO");
  });

  it("rejects a cross-origin request with 403 before touching the model", async () => {
    const { handleChat } = await import("./chat.server");
    const res = await handleChat(
      chatRequest(validBody(), { origin: "http://evil.example", host: "localhost" }),
    );
    expect(res.status).toBe(403);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });
});

describe("streaming error surface", () => {
  it("unwraps the provider error and applies the fallbacks", async () => {
    mocks.getLanguageModel.mockReturnValue({});
    const { result, opts } = streamResult();
    mocks.streamText.mockReturnValue(result);
    const { handleChat } = await import("./chat.server");
    await handleChat(chatRequest(validBody()));
    const o = opts();

    expect(
      o.onError(
        new Error(
          "AI_RetryError: Failed after 3 attempts. Last error: AI_APICallError: Cuota agotada",
        ),
      ),
    ).toBe("Cuota agotada");
    expect(o.onError(new Error("fallo simple"))).toBe("fallo simple");
    expect(o.onError(new Error(""))).toBe("Error al generar la respuesta.");
    expect(o.onError("cadena suelta")).toBe("cadena suelta");
  });
});

describe("streaming persistence", () => {
  async function drive(): Promise<StreamOpts> {
    mocks.getLanguageModel.mockReturnValue({});
    const { result, opts } = streamResult();
    mocks.streamText.mockReturnValue(result);
    const { handleChat } = await import("./chat.server");
    await handleChat(chatRequest(validBody()));
    return opts();
  }

  it("saves the user turn plus the reply and audits the query", async () => {
    const o = await drive();
    const { getDb } = await import("@/lib/db.server");
    const schema = await import("../../../drizzle/schema");
    const { orm } = await getDb();
    const before = orm.select().from(schema.chatMessages).all().length;

    await o.onFinish({
      responseMessage: { id: "a1", role: "assistant", parts: [{ type: "text", text: "lista" }] },
    });

    const after = orm.select().from(schema.chatMessages).all();
    expect(after.length).toBe(before + 2); // the user message + the assistant reply
    expect(JSON.stringify(after.at(-1)?.message)).toContain("lista");

    const audits = orm
      .select()
      .from(schema.activity)
      .all()
      .filter((a) => a.type === "Consulta");
    expect(audits.length).toBeGreaterThan(0);
  });

  it("stores only the assistant reply on an approval continuation", async () => {
    mocks.getLanguageModel.mockReturnValue({});
    const { result, opts } = streamResult();
    mocks.streamText.mockReturnValue(result);
    const { handleChat } = await import("./chat.server");
    await handleChat(
      chatRequest({
        expertId: "ventas",
        messages: [{ id: "a0", role: "assistant", parts: [{ type: "text", text: "aprobado" }] }],
      }),
    );
    const { getDb } = await import("@/lib/db.server");
    const schema = await import("../../../drizzle/schema");
    const { orm } = await getDb();
    const before = orm.select().from(schema.chatMessages).all().length;

    await opts().onFinish({
      responseMessage: { id: "a1", role: "assistant", parts: [{ type: "text", text: "hecho" }] },
    });
    const after = orm.select().from(schema.chatMessages).all();
    expect(after.length).toBe(before + 1);
  });
});

describe("lastMessageText with no messages", () => {
  it("returns an empty string", async () => {
    const { lastMessageText } = await import("./chat.server");
    expect(lastMessageText([])).toBe("");
  });
});

describe("chat tool context", () => {
  it("wires a propose tool to the real pending-action audit logger", async () => {
    const { getDb, persist } = await import("@/lib/db.server");
    const { raw } = await getDb();
    raw.run(
      "INSERT OR REPLACE INTO integrations (id,name,category,connected,entities) VALUES (?,?,?,?,?)",
      ["holded", "Holded", "finanzas", 1, "[]"],
    );
    raw.run(
      "INSERT OR REPLACE INTO invoices (id,client,amount,due_date,status,reminders) VALUES (?,?,?,?,?,?)",
      ["inv-chat", "Cliente Chat", 100, "2000-01-01", "overdue", 0],
    );
    await persist();

    mocks.getLanguageModel.mockReturnValue({});
    const { result } = streamResult();
    mocks.streamText.mockReturnValue(result);
    const { handleChat } = await import("./chat.server");
    // The seeded "finanzas" expert owns the finanzas domain (and needs a
    // connected source, which we just wired up).
    await handleChat(chatRequest({ expertId: "finanzas", messages: [userMessage("reclama")] }));

    const args = mocks.streamText.mock.calls[0]?.[0] as {
      tools: Record<string, { execute: (i: unknown) => Promise<Record<string, unknown>> }>;
    };
    const out = await args.tools["propose_invoice_reminders"]!.execute({
      invoiceIds: ["inv-chat"],
    });
    expect(out["status"]).toBe("pending");
    expect(out["title"]).toMatch(/^Enviar 1 /);

    const schema = await import("../../../drizzle/schema");
    const { orm } = await getDb();
    const pending = orm
      .select()
      .from(schema.activity)
      .all()
      .filter((a) => a.status === "pending");
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.at(-1)?.expertId).toBe("finanzas");
  });
});
