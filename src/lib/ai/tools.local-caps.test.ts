// SPDX-License-Identifier: MIT
// Lo que las herramientas de archivos locales dicen cuando se cortan.
//
// El recorrido de una carpeta concedida tiene un tope (`MAX_WALK_FILES`, 5 000) y
// hasta ahora el tope viajaba al modelo como si fuera el recuento de la carpeta:
// `list_local_files` contestaba «total: 5000» sobre una carpeta de 5 001 —o de
// 20 000— archivos, y las dos busquedas solo miraban esos primeros 5 000 sin
// decirlo. El modelo, que tiene instrucciones de no inventar y de decir cuando
// solo ha leido una parte, respondia con un dato falso: «no hay ningun archivo
// que mencione eso», con el archivo dentro de la carpeta.
//
// Esta prueba fija el contrato que falta: cuando el recorrido se corta, la
// respuesta lo dice; y cuando una busqueda enseña menos de las que hay, da el
// recuento de las que hay.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dataDirTmp: string;
let bigRoot: string;
let matchesRoot: string;

/** Archivos creados en `dir`, nombrados con `prefix` y un número a cuatro cifras. */
function seedFiles(dir: string, count: number, prefix: string): void {
  mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= count; i += 1) {
    writeFileSync(join(dir, `${prefix}-${String(i).padStart(4, "0")}.txt`), "x");
  }
}

beforeAll(() => {
  dataDirTmp = mkdtempSync(join(tmpdir(), "openexpert-caps-data-"));
  process.env["OPENEXPERT_DATA_DIR"] = dataDirTmp;
  bigRoot = join(dataDirTmp, "carpeta-grande");
  matchesRoot = join(dataDirTmp, "carpeta-con-coincidencias");
  // 5 001: uno más que MAX_WALK_FILES, para que el recorrido tenga que cortarse.
  seedFiles(bigRoot, 5_001, "doc");
  // 250 coincidencias: más que el corte de 200 de `search_local_files`.
  seedFiles(matchesRoot, 250, "factura");
});

afterAll(() => {
  rmSync(dataDirTmp, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

type Executable = { execute: (input: unknown) => Promise<Record<string, unknown>> };
const exec = (t: unknown) => (t as Executable).execute;

/** Las herramientas de un Experto con archivos locales, con `path` como única raiz concedida. */
async function toolsWithRoot(path: string) {
  const { createChatTools } = await import("./tools");
  const { saveLocalRoots } = await import("../engine/local-secrets.server");
  saveLocalRoots([{ path, name: "carpeta de prueba", addedAt: new Date().toISOString() }]);
  return createChatTools({
    expert: { name: "General", sources: ["local"] },
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

describe("topes del recorrido de archivos locales", () => {
  it("dice que el listado se cortó en el tope en vez de presentarlo como el total", async () => {
    const tools = await toolsWithRoot(bigRoot);
    const out = await exec(tools.list_local_files)({});

    // El 5 000 es el tope de `listLocalFiles`, no lo que hay en la carpeta.
    expect(out["truncated"]).toBe(true);
    expect(out["total"]).not.toBe(5_000);
    expect(String(out["note"] ?? "")).toMatch(/5[. ]?000/);
  });

  it("da cuántas coincidencias hay cuando enseña solo las primeras 200", async () => {
    const tools = await toolsWithRoot(matchesRoot);
    const out = await exec(tools.search_local_files)({ query: "factura" });

    expect((out["files"] as unknown[]).length).toBe(200);
    expect(out["total"]).toBe(250);
  });
});
