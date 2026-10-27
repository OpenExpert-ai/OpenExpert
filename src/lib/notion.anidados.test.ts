// SPDX-License-Identifier: MIT
// `readPage` desciende por los bloques hijos hasta un tope de profundidad y, al
// llegar ahí, deja de bajar. Hoy ese corte no deja rastro: el texto del nivel
// que no se leyó no aparece y `hasMore` vuelve en `false`, que es justo la señal
// que el modelo lee como «esta es la página entera» (la descripción de
// `read_notion_page` dice que con `hasMore: true` el texto es parcial). Una lista
// dentro de un desplegable dentro de una cita se resume sin su último nivel y
// sin avisar, y subir `maxBlocks` no lo arregla: el tope que actúa es de
// profundidad, no de número de bloques.
//
// Lo que se fija aquí: se lee hasta el cuarto nivel, y lo que quede por debajo
// se anuncia.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./notion-tokens.server", () => ({
  getNotionToken: () => "secret_token",
  NOTION_VERSION: "2026-03-11",
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Un párrafo con hijos (`has_children`) o sin ellos. */
const paragraph = (id: string, text: string, hasChildren: boolean) => ({
  id,
  object: "block",
  type: "paragraph",
  paragraph: { rich_text: [{ plain_text: text }] },
  has_children: hasChildren,
});

/**
 * Un `fetch` que sirve el árbol de bloques por id: `children` dice qué devuelve
 * `/blocks/<id>/children`. Los hijos de un bloque solo se piden cuando el lector
 * desciende a él, así que lo que quedó sin pedir es lo que quedó sin leer.
 */
function blockTree(children: Record<string, unknown[]>) {
  const requested: string[] = [];
  const impl = async (url: string | URL): Promise<Response> => {
    const u = new URL(String(url));
    const id = /\/blocks\/([^/]+)\/children$/.exec(u.pathname)?.[1] ?? "";
    requested.push(id);
    return json({ results: children[id] ?? [], has_more: false, next_cursor: null });
  };
  return { impl: impl as unknown as typeof fetch, requested };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

describe("readPage: los bloques anidados no se pierden en silencio", () => {
  it("lee el texto del cuarto nivel, no solo el de los tres primeros", async () => {
    // página → párrafo → párrafo → párrafo → párrafo: el anidamiento corriente de
    // una lista dentro de un desplegable dentro de una cita.
    const tree = blockTree({
      pg1: [paragraph("b1", "Nivel 1", true)],
      b1: [paragraph("b2", "Nivel 2", true)],
      b2: [paragraph("b3", "Nivel 3", true)],
      b3: [paragraph("b4", "Nivel 4", false)],
    });
    vi.stubGlobal("fetch", tree.impl);
    const { readPage } = await import("./notion.server");
    const out = await readPage("pg1");
    expect(out.content).toContain("Nivel 3");
    // Hoy el lector se para en el tercero y este texto no llega nunca.
    expect(out.content).toContain("Nivel 4");
    // Se leyó todo lo que hay, así que el texto es la página entera.
    expect(out.hasMore).toBe(false);
  });

  it("lo que queda por debajo del tope de profundidad se anuncia con hasMore", async () => {
    const tree = blockTree({
      pg1: [paragraph("b1", "Nivel 1", true)],
      b1: [paragraph("b2", "Nivel 2", true)],
      b2: [paragraph("b3", "Nivel 3", true)],
      b3: [paragraph("b4", "Nivel 4", true)],
      b4: [paragraph("b5", "Nivel 5", false)],
    });
    vi.stubGlobal("fetch", tree.impl);
    const { readPage } = await import("./notion.server");
    const out = await readPage("pg1");
    // El quinto nivel queda fuera del tope: el texto no es la página entera y
    // `hasMore` tiene que decirlo. Hoy vuelve en `false`.
    expect(out.hasMore).toBe(true);
    expect(out.content).not.toContain("Nivel 5");
    // Con `maxBlocks` al máximo el corte es el mismo: el tope es de profundidad.
    const wide = await readPage("pg1", { maxBlocks: 1000 });
    expect(wide.hasMore).toBe(true);
  });
});
