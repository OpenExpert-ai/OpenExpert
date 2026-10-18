// SPDX-License-Identifier: MIT
// El conector de Anthropic, de extremo a extremo y sin salir de la máquina.
//
// Un servidor local hace de API de Mensajes: se le apunta la dirección de la
// ficha de Anthropic y se le pide una respuesta de verdad. Así se comprueba lo
// que ninguna prueba unitaria puede: que la petición sale hacia `<base>/messages`
// con la clave de Anthropic en `x-api-key`, su versión de protocolo y el modelo
// elegido, y que la respuesta vuelve convertida en texto.
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { generateText } from "ai";

let baseUrl = "";

// La ficha manda la dirección; en la prueba es la del servidor local.
vi.mock("@openexpert/openexpert/model-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@openexpert/openexpert/model-provider")>();
  return {
    ...actual,
    providerDef: (id: string) => {
      const def = actual.providerDef(id);
      return id === "anthropic" && def ? { ...def, baseUrl } : def;
    },
  };
});

const { getLanguageModel } = await import("./model-provider.server");

type Seen = { url: string; method: string; headers: Record<string, string>; body: string };

let server: Server;
let seen: Seen[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      seen.push({
        url: req.url ?? "",
        method: req.method ?? "",
        headers: req.headers as Record<string, string>,
        body,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_local",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-5",
          content: [{ type: "text", text: "Hola desde el modelo" }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 3, output_tokens: 5 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/v1`;
});

afterAll(() => {
  server.close();
});

const ENV = ["OPENEXPERT_MODEL_PROVIDER", "OPENEXPERT_MODEL_ID", "ANTHROPIC_API_KEY"];
const original = new Map(ENV.map((k) => [k, process.env[k]]));

function setEnv(values: Record<string, string>): void {
  for (const k of ENV) delete process.env[k];
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
}

afterEach(() => {
  seen = [];
  for (const [k, v] of original) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("el conector de Anthropic", () => {
  it("manda una petición de Mensajes con su clave y su versión de protocolo", async () => {
    setEnv({
      OPENEXPERT_MODEL_PROVIDER: "anthropic",
      OPENEXPERT_MODEL_ID: "claude-sonnet-4-5",
      ANTHROPIC_API_KEY: "sk-ant-de-prueba",
    });

    const result = await generateText({ model: getLanguageModel(), prompt: "hola" });

    expect(result.text).toBe("Hola desde el modelo");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.url).toBe("/v1/messages");
    // La clave de Anthropic, en la cabecera de Anthropic.
    expect(seen[0]!.headers["x-api-key"]).toBe("sk-ant-de-prueba");
    expect(seen[0]!.headers["anthropic-version"]).toBe("2023-06-01");
    // Ni rastro del esquema del endpoint genérico.
    expect(seen[0]!.headers["authorization"]).toBeUndefined();
    const body = JSON.parse(seen[0]!.body) as {
      model: string;
      messages: { content: { type: string; text: string }[] }[];
    };
    expect(body.model).toBe("claude-sonnet-4-5");
    expect(body.messages[0]!.content).toEqual([{ type: "text", text: "hola" }]);
  });
});
