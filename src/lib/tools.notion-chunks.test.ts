// SPDX-License-Identifier: MIT
// Añadir bloques a una página de Notion respeta el tope de la API.
//
// `append_notion_blocks` acepta `children` sin tope (`z.array(z.unknown())`) y
// `appendBlocks` los manda todos en un único `PATCH /blocks/{id}/children`. La
// API de Notion lo rechaza por encima de 100: «There is a limit of 100 block
// children that can be appended by a single API request. Arrays of block
// children longer than 100 will result in an error»
// (developers.notion.com/reference/patch-block-children). Una página larga que
// el modelo añade de una vez —una lista de 150 viñetas— termina en un 400 que
// la herramienta devuelve como «Notion respondió 400», sin decir por qué ni
// cuánto se escribió, y el contenido no llega.
//
// El contrato que falta es el de las lecturas (`boundedList`): la escritura se
// trocea en lotes de 100 como máximo, en orden, y el resultado dice cuántos
// bloques se añadieron.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./notion-tokens.server", () => ({
  getNotionToken: () => "secret_token",
  NOTION_VERSION: "2026-03-11",
}));

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-notion-chunks-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Un párrafo de Notion, que es lo que el modelo manda cuando escribe una lista. */
const paragraph = (n: number) => ({
  object: "block",
  type: "paragraph",
  paragraph: { rich_text: [{ type: "text", text: { content: `Fila ${n}` } }] },
});

type Executable = { execute: (input: unknown) => Promise<Record<string, unknown>> };
const exec = (t: unknown) => (t as Executable).execute;

async function notionTools() {
  const { createChatTools } = await import("./ai/tools");
  return createChatTools({
    expert: { name: "General", sources: ["notion"] },
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
}

/** Un fetch doble que guarda los `children` de cada PATCH, en orden. */
function recordingFetch() {
  const bodies: unknown[][] = [];
  const urls: string[] = [];
  const mock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    urls.push(String(url));
    const body = JSON.parse(String(init?.body ?? "{}")) as { children?: unknown[] };
    bodies.push(body.children ?? []);
    return json({ object: "list", results: [] });
  });
  return { mock, bodies, urls };
}

describe("append_notion_blocks: el tope de 100 bloques por petición", () => {
  it("trocea 250 bloques en lotes de 100 y dice cuántos añadió", async () => {
    const { mock, bodies } = recordingFetch();
    vi.stubGlobal("fetch", mock);
    const tools = await notionTools();
    const children = Array.from({ length: 250 }, (_, i) => paragraph(i + 1));

    const out = await exec(tools.append_notion_blocks)({ pageId: "p1", children });

    // Tres peticiones: 100 + 100 + 50. Una sola con 250 es el 400 de Notion.
    expect(bodies.length).toBe(3);
    expect(bodies.every((batch) => batch.length <= 100)).toBe(true);
    expect(bodies.reduce((total, batch) => total + batch.length, 0)).toBe(250);
    // El orden de los bloques es el contenido: el primer lote es el principio.
    expect(bodies[0]).toHaveLength(100);
    expect(bodies[2]).toHaveLength(50);
    // Y el resultado dice lo que se escribió, no un «appended» sin cifra.
    expect(out["appended"]).toBe(250);
    expect(out["error"]).toBeUndefined();
  });

  it("con cinco bloques hace una sola petición", async () => {
    const { mock, bodies } = recordingFetch();
    vi.stubGlobal("fetch", mock);
    const tools = await notionTools();
    const children = Array.from({ length: 5 }, (_, i) => paragraph(i + 1));

    const out = await exec(tools.append_notion_blocks)({ pageId: "p1", children });

    expect(bodies.length).toBe(1);
    expect(bodies[0]).toHaveLength(5);
    expect(out["appended"]).toBe(5);
  });
});
