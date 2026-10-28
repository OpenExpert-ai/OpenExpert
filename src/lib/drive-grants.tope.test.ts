// SPDX-License-Identifier: MIT
// La lista de archivos concedidos del Picker tiene tope —5.000—, y el tope se
// aplica con un `slice(-5000)` que tira las concesiones más antiguas sin decir
// nada: una concesión retirada es acceso retirado, porque `search_drive` y
// `read_drive_file` solo leen los ids que siguen en el fichero. La pantalla
// contesta «N archivos añadidos» con el número que el usuario acaba de elegir,
// así que nadie se entera de que un archivo que estaba concedido ha dejado de
// estarlo. El tope es legítimo; callarlo, no.
//
// Este test fija tres cosas: que el recorte se nombra en la respuesta, que la
// concesión que cae es la de `addedAt` más antiguo, y que un archivo que se
// vuelve a elegir en el Picker se queda dentro —hoy conserva su `addedAt` y su
// posición, así que puede ser justo el que cae en la misma llamada.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type ServerFn = ((opts?: { data?: unknown }) => Promise<unknown>) & {
  validator: (validate: (input: unknown) => unknown) => ServerFn;
  handler: (run: (ctx: { data: unknown }) => unknown) => ServerFn;
};

vi.mock("@tanstack/react-start", () => {
  const createServerFn = (): ServerFn => {
    let validate: (input: unknown) => unknown = (input) => input;
    let run: ((ctx: { data: unknown }) => unknown) | undefined;
    const call = (async (opts?: { data?: unknown }) => {
      if (!run) throw new Error("server function without a handler");
      return await run({ data: validate(opts?.data) });
    }) as ServerFn;
    call.validator = (next) => {
      validate = next;
      return call;
    };
    call.handler = (next) => {
      run = next;
      return call;
    };
    return call;
  };
  return { createServerFn };
});

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ origin: "http://localhost:3000" }),
}));

let dir: string;
let fns: typeof import("./data.functions");
let local: typeof import("./engine/local-secrets.server");

const CAP = 5000;

/** `CAP` concesiones, la primera (f0) la más antigua. */
function grants(cap = CAP) {
  return Array.from({ length: cap }, (_, i) => ({
    id: `g${i}`,
    name: `f${i}.pdf`,
    mimeType: "application/pdf",
    addedAt: new Date(Date.UTC(2020, 0, 1) + i * 60_000).toISOString(),
  }));
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-grants-tope-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
  fns = await import("./data.functions");
  local = await import("./engine/local-secrets.server");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

describe("el tope de concesiones de Drive", () => {
  it("dice qué concesión retira cuando la lista está llena", async () => {
    local.saveGrantedFiles(grants());

    const res = (await fns.addGrantedFiles({
      data: { files: [{ id: "nuevo", name: "nuevo.pdf", mimeType: "application/pdf" }] },
    })) as { ok: boolean; count: number };

    // 5.000 concedidos + 1: el más antiguo (f0) cae, y la respuesta lo nombra.
    expect(res).toMatchObject({ ok: true, count: CAP, evicted: { count: 1, names: ["f0.pdf"] } });
    const after = local.loadGrantedFiles();
    expect(after.some((g) => g.id === "nuevo")).toBe(true);
    expect(after.some((g) => g.id === "g0")).toBe(false);
  });

  it("no retira el archivo que el usuario acaba de volver a elegir", async () => {
    local.saveGrantedFiles(grants());

    // El usuario vuelve a elegir el más antiguo (g0, f0.pdf) y añade uno nuevo.
    const res = (await fns.addGrantedFiles({
      data: {
        files: [
          { id: "g0", name: "f0.pdf", mimeType: "application/pdf" },
          { id: "nuevo", name: "nuevo.pdf", mimeType: "application/pdf" },
        ],
      },
    })) as { ok: boolean; count: number };

    // Lo que se acaba de elegir sigue concedido; cae el siguiente más antiguo.
    const after = local.loadGrantedFiles();
    expect(after.some((g) => g.id === "g0")).toBe(true);
    expect(after.some((g) => g.id === "g1")).toBe(false);
    expect(res).toMatchObject({ ok: true, count: CAP, evicted: { count: 1, names: ["f1.pdf"] } });
  });

  it("por debajo del tope no retira nada ni habla de retiradas", async () => {
    local.saveGrantedFiles(grants(10));

    const res = (await fns.addGrantedFiles({
      data: { files: [{ id: "nuevo", name: "nuevo.pdf", mimeType: "application/pdf" }] },
    })) as { ok: boolean; count: number };

    expect(res).toEqual({ ok: true, count: 11 });
    expect(local.loadGrantedFiles()).toHaveLength(11);
  });
});
