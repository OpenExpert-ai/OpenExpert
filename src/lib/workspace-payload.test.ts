// SPDX-License-Identifier: MIT
// `getWorkspace` devuelve las tablas de facturas y campañas enteras
// (`data.functions.ts:79-80` y `:119-120`) y `useWorkspace` refresca cada 15 s
// mientras la app está abierta (`store.tsx:38`). Nadie las lee: en `src/` las
// facturas y las campañas aparecen como recuento (`business.functions.ts:49`),
// como salida de una herramienta del chat (`expert.tsx:841`, `:861`) o como
// nombre de una columna de la pantalla de datos; `ws.invoices` y `ws.campaigns`
// no los lee ni un componente.
//
// Medido con la base llena —5.000 facturas y 5.000 campañas, que es el tope por
// fichero del importador (`CSV_MAX_ROWS`)—: 98,4 ms y 872 KB por lectura, de los
// que 870 KB son las dos listas. Con el panel abierto son unos 870 KB cada 15 s
// de datos que no se pintan.
//
// El test fija el contrato: el workspace lleva lo que la ventana necesita y no
// las dos tablas, y el tamaño se queda acotado aunque el CRM esté lleno.

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

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-ws-payload-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
  fns = await import("./data.functions");
  // Una sola siembra para los tres casos: las tres aserciones miran el mismo
  // estado y ninguna lo toca, así que reponerlo en cada `it` eran 30 000
  // `INSERT` fila a fila para comprobar tres cosas. Sembrar aquí deja el mismo
  // contrato y aparta al fichero del `testTimeout` de 5 s. Si algún caso
  // llegara a escribir en `invoices`/`campaigns`, tiene que reponer el estado
  // (volver a llamar a `seedFullBusinessTables()` desde el propio test).
  await seedFullBusinessTables();
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

/** Una base como la de un CRM importado: el tope de filas por fichero, en las dos tablas. */
async function seedFullBusinessTables() {
  const { getDb } = await import("./db.server");
  const { raw } = await getDb();
  raw.run("DELETE FROM invoices");
  raw.run("DELETE FROM campaigns");
  // `sql.js` compila cada `run()` desde cero, así que 10 000 sentencias sueltas
  // tardaban casi tres segundos: lo que decide aquí es el número de sentencias,
  // no las filas. Preparadas una vez y dentro de una transacción, las mismas
  // 10 000 filas dejan el estado idéntico en unas décimas.
  const invoice = raw.prepare(
    "INSERT INTO invoices (id,client,amount,due_date,status,reminders) VALUES (?,?,?,?,?,?)",
  );
  const campaign = raw.prepare(
    "INSERT INTO campaigns (id,name,channel,status,spend_7d,conversions_7d,cpa_target,daily_budget) VALUES (?,?,?,?,?,?,?,?)",
  );
  raw.run("BEGIN");
  try {
    for (let i = 0; i < 5000; i++) {
      invoice.run([`inv-${i}`, `Cliente con nombre largo ${i}`, 1200.5, "2026-02-01", "open", 0]);
      campaign.run([`cmp-${i}`, `Campaña de marca número ${i}`, "meta", "active", 840, 12, 40, 30]);
    }
    raw.run("COMMIT");
  } catch (e) {
    raw.run("ROLLBACK");
    throw e;
  } finally {
    invoice.free();
    campaign.free();
  }
}

describe("lo que viaja en el workspace", () => {
  it("no lleva las tablas de facturas ni de campañas", async () => {
    const ws = (await fns.getWorkspace()) as Record<string, unknown>;
    expect(Object.keys(ws)).not.toContain("invoices");
    expect(Object.keys(ws)).not.toContain("campaigns");
  });

  it("se queda acotado con el CRM lleno, en vez de crecer con las tablas", async () => {
    const ws = (await fns.getWorkspace()) as Record<string, unknown>;
    const bytes = JSON.stringify(ws).length;
    // Hoy son 872 KB. La ventana no necesita más que sus Expertos, sus integraciones y
    // la página de actividad, así que el tope es cuarenta veces menor.
    expect(bytes).toBeLessThan(64 * 1024);
  });

  it("sigue trayendo lo que la ventana pinta y el recuento de filas de negocio", async () => {
    const ws = (await fns.getWorkspace()) as {
      me: { name: string };
      experts: unknown[];
      integrations: unknown[];
      activity: unknown[];
      activityTotal: number;
      businessRows: number;
    };
    expect(ws.me.name).toBe("Propietario local");
    expect(ws.experts.length).toBeGreaterThan(0);
    expect(Array.isArray(ws.integrations)).toBe(true);
    expect(Array.isArray(ws.activity)).toBe(true);
    expect(typeof ws.activityTotal).toBe("number");
    // Diez mil filas de negocio: el chat tiene datos que consultar aunque no haya conector.
    expect(ws.businessRows).toBe(10000);
  });
});
