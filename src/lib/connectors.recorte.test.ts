// SPDX-License-Identifier: MIT
// La descarga de un conector tiene topes —50 páginas y 5 000 filas— y los dos
// cortan en silencio: `fetchPipedriveDeals` y `fetchHoldedInvoices` devuelven
// las filas que trajeron y nada que distinga «esto es todo» de «aquí me paré».
// El resultado llega al panel como «Sincronizados N registros», la integración
// queda `connected: true` y el modelo contesta con cifras calculadas sobre un
// trozo, como si fuera el total.
//
// Lo que se fija aquí es el contrato: el recorte se dice, y se dice cuando el
// que corta es el tope (no cuando el proveedor se acabó).

import { describe, expect, it } from "vitest";
import { fetchHoldedInvoices, fetchPipedriveDeals } from "./connectors.server";

/** El campo que la descarga tiene que publicar. Se lee con esta forma para que
 *  el rojo de hoy sea la aserción y no un error de tipos. */
type WithTruncation = { truncated?: boolean };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** 100 negocios válidos por página, con el paginador de Pipedrive en la forma real. */
function dealsPage(page: number, more: boolean) {
  return {
    data: Array.from({ length: 100 }, (_, i) => ({
      id: page * 100 + i,
      title: `Negocio ${page}-${i}`,
      value: 100,
      status: "open",
      stage_id: 1,
    })),
    additional_data: {
      pagination: { more_items_in_collection: more, next_start: (page + 1) * 100 },
    },
  };
}

/** `pages` páginas de negocios; la última dice que no hay más salvo en `allPagesMore`. */
function pipedriveFetch(pages: number, allPagesMore: boolean) {
  let served = 0;
  const calls: string[] = [];
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/stages")) return jsonResponse({ data: [{ id: 1, name: "Demo" }] });
    const page = served++;
    const more = page + 1 < pages || allPagesMore;
    return jsonResponse(dealsPage(page, more));
  };
  return { impl: impl as unknown as typeof fetch, calls, served: () => served };
}

function holdedFetch(pages: number, allPagesMore: boolean) {
  let served = 0;
  const impl = async (): Promise<Response> => {
    const page = served++;
    const more = page + 1 < pages || allPagesMore;
    return jsonResponse({
      items: [
        {
          id: `inv-${page}`,
          contact_name: `Cliente ${page}`,
          total: "120,50",
          due_date: "2026-09-01",
          status: "pending",
        },
      ],
      has_more: more,
      next_cursor: `cursor-${page + 1}`,
    });
  };
  return { impl: impl as unknown as typeof fetch, served: () => served };
}

describe("fetchPipedriveDeals: el tope de la descarga se dice", () => {
  it("un proveedor con más páginas de las que se descargan queda como cortado", async () => {
    // 60 páginas disponibles y 100 negocios por página: el bucle para en el tope
    // (50 páginas / 5 000 filas) con el paginador diciendo que hay más.
    const fake = pipedriveFetch(60, true);
    const out = (await fetchPipedriveDeals(
      "token-de-prueba",
      fake.impl,
    )) as unknown as WithTruncation;
    expect(out.truncated).toBe(true);
  });

  it("una cuenta que se termina antes del tope no se anuncia como cortada", async () => {
    const fake = pipedriveFetch(3, false);
    const out = (await fetchPipedriveDeals(
      "token-de-prueba",
      fake.impl,
    )) as unknown as WithTruncation;
    expect(out.truncated).toBe(false);
  });
});

describe("fetchHoldedInvoices: el tope de la descarga se dice", () => {
  it("cortar por páginas sin llegar al tope de filas también cuenta como corte", async () => {
    // Una página = una factura: `rows.length` se queda en 50 y el tope de filas no
    // se alcanza nunca, así que el corte solo puede deducirse del bucle.
    const fake = holdedFetch(80, true);
    const out = (await fetchHoldedInvoices(
      "clave-de-prueba",
      fake.impl,
    )) as unknown as WithTruncation;
    expect(out.truncated).toBe(true);
  });

  it("una cuenta que se termina antes del tope no se anuncia como cortada", async () => {
    const fake = holdedFetch(2, false);
    const out = (await fetchHoldedInvoices(
      "clave-de-prueba",
      fake.impl,
    )) as unknown as WithTruncation;
    expect(out.truncated).toBe(false);
  });
});
