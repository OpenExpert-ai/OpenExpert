// SPDX-License-Identifier: MIT
// Optional pull connectors. They only read from the provider and upsert into
// the local business tables; nothing is sent back. Tokens are supplied by the
// owner and stored by the caller (0600), never here.
import { eq } from "drizzle-orm";
import { getDb, persist } from "./db.server";
import * as schema from "../../drizzle/schema";
import { importBusinessRows, type ImportCounts } from "./business-import.server";
import {
  mapHoldedInvoice,
  mapPipedriveDeal,
  type HoldedInvoice,
  type PipedriveDeal,
} from "./connectors";
import type { ParsedBusinessRow } from "./business-csv";

const PIPEDRIVE = "https://api.pipedrive.com/v1";
const HOLDED = "https://api.holded.com/api/v2";
const MAX_ROWS = 5000;
const MAX_PAGES = 50;
const TIMEOUT_MS = 20_000;

type Fetch = typeof fetch;

type SyncResult = ImportCounts & { fetched: number; truncated: boolean };

function message(provider: string, status: number): string {
  if (status === 401) return `${provider} rechazó la clave (401). Revísala y vuelve a intentarlo.`;
  if (status === 403)
    return `${provider} denegó el acceso (403). Comprueba los permisos de la clave.`;
  if (status === 429) return `${provider} está limitando las peticiones (429). Espera un minuto.`;
  return `${provider} respondió ${status}.`;
}

async function getJson(provider: string, url: string, init: RequestInit, fetchImpl: Fetch) {
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(message(provider, res.status));
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`${provider} devolvió una respuesta no válida; no se han importado datos.`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error(`${provider} devolvió una respuesta no válida; no se han importado datos.`);
  const json = body as Record<string, unknown>;
  if (json["success"] === false)
    throw new Error(`${provider} informó de un error; no se han importado datos.`);
  return json;
}

async function markConnected(
  id: "pipedrive" | "holded",
  entities: { name: string; count: number }[],
): Promise<void> {
  const { orm } = await getDb();
  orm
    .update(schema.integrations)
    .set({ connected: true, lastSync: new Date().toISOString(), entities })
    .where(eq(schema.integrations.id, id))
    .run();
  await persist();
}

/** All Pipedrive deals, following the v1 offset pagination. */
export async function fetchPipedriveDeals(
  token: string,
  fetchImpl: Fetch = fetch,
): Promise<{ rows: ParsedBusinessRow[]; fetched: number; truncated: boolean }> {
  const stages = new Map<string, string>();
  try {
    const stageJson = await getJson(
      "Pipedrive",
      `${PIPEDRIVE}/stages?api_token=${encodeURIComponent(token)}`,
      {},
      fetchImpl,
    );
    for (const stage of (stageJson["data"] as { id?: number; name?: string }[] | undefined) ?? []) {
      if (stage.id !== undefined && stage.name) stages.set(String(stage.id), stage.name);
    }
  } catch {
    // The deals still import with their numeric stage; a stage-list failure is
    // not a reason to lose the whole sync.
  }

  const rows: ParsedBusinessRow[] = [];
  let start = 0;
  let fetched = 0;
  // El tope corta la descarga: si al agotar páginas o filas el paginador sigue
  // diciendo que hay más, lo que falta no se trae y se avisa. No se deduce de
  // `rows.length`, porque una página puede no llegar al tope de filas (el mapeo
  // descarta negocios) y el corte viene igualmente por el número de páginas.
  let truncated = false;
  for (let page = 0; page < MAX_PAGES && rows.length < MAX_ROWS; page++) {
    const json = await getJson(
      "Pipedrive",
      `${PIPEDRIVE}/deals?status=all&start=${start}&limit=100&api_token=${encodeURIComponent(token)}`,
      {},
      fetchImpl,
    );
    const rawData = json["data"];
    // Pipedrive puede responder data: null cuando no hay oportunidades, pero
    // solo si la propia respuesta confirma el éxito. Ausencia u otro tipo no
    // demuestran que la colección esté vacía.
    if (!Array.isArray(rawData) && !(rawData === null && json["success"] === true))
      throw new Error(
        "Pipedrive devolvió una lista de oportunidades no válida; no se han importado datos.",
      );
    const data = (rawData ?? []) as PipedriveDeal[];
    for (const deal of data) {
      fetched++;
      const mapped = mapPipedriveDeal(deal, stages);
      if (mapped) rows.push({ entity: "deals", data: mapped });
    }
    const pagination = (
      json["additional_data"] as { pagination?: Record<string, unknown> } | undefined
    )?.pagination;
    const more = pagination?.["more_items_in_collection"];
    if (more === false || (data.length === 0 && more === undefined)) break;
    if (more !== true)
      throw new Error("Pipedrive no indicó si quedan más páginas; no se han importado datos.");
    const next = pagination?.["next_start"];
    if (typeof next !== "number" || !Number.isSafeInteger(next) || next <= start)
      throw new Error(
        "Pipedrive indicó más páginas sin un siguiente desplazamiento válido; no se han importado datos.",
      );
    start = next;
    // Si esta era la última vuelta que el tope permite, el proveedor todavía
    // tenía más y esa parte se queda fuera.
    truncated = page + 1 >= MAX_PAGES || rows.length >= MAX_ROWS;
  }
  return { rows, fetched, truncated };
}

/** All Holded invoices, following the v2 cursor pagination. */
export async function fetchHoldedInvoices(
  key: string,
  fetchImpl: Fetch = fetch,
): Promise<{ rows: ParsedBusinessRow[]; fetched: number; truncated: boolean }> {
  const rows: ParsedBusinessRow[] = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();
  let fetched = 0;
  // Mismo trato que en Pipedrive: el corte por página o por filas se dice.
  let truncated = false;
  for (let page = 0; page < MAX_PAGES && rows.length < MAX_ROWS; page++) {
    const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const json = await getJson(
      "Holded",
      `${HOLDED}/invoices?limit=100${suffix}`,
      { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } },
      fetchImpl,
    );
    const rawItems = json["items"] ?? json["data"];
    if (!Array.isArray(rawItems))
      throw new Error(
        "Holded devolvió una lista de facturas no válida; no se han importado datos.",
      );
    const items = rawItems as HoldedInvoice[];
    for (const invoice of items) {
      fetched++;
      const mapped = mapHoldedInvoice(invoice);
      if (mapped) rows.push({ entity: "invoices", data: mapped });
    }
    if (json["has_more"] === false || (items.length === 0 && json["has_more"] === undefined)) break;
    if (json["has_more"] !== true)
      throw new Error("Holded no indicó si quedan más páginas; no se han importado datos.");
    const next = json["next_cursor"] ?? json["cursor"];
    if (typeof next !== "string" || !next.trim() || seenCursors.has(next))
      throw new Error(
        "Holded indicó más páginas sin un siguiente cursor válido; no se han importado datos.",
      );
    seenCursors.add(next);
    cursor = next;
    truncated = page + 1 >= MAX_PAGES || rows.length >= MAX_ROWS;
  }
  return { rows, fetched, truncated };
}

export async function syncPipedrive(token: string, fetchImpl: Fetch = fetch): Promise<SyncResult> {
  const { rows, fetched, truncated } = await fetchPipedriveDeals(token, fetchImpl);
  const counts = await importBusinessRows("deals", rows, "Pipedrive");
  await markConnected("pipedrive", [{ name: "Deals", count: counts.inserted + counts.updated }]);
  return { ...counts, fetched, truncated };
}

export async function syncHolded(key: string, fetchImpl: Fetch = fetch): Promise<SyncResult> {
  const { rows, fetched, truncated } = await fetchHoldedInvoices(key, fetchImpl);
  const counts = await importBusinessRows("invoices", rows, "Holded");
  await markConnected("holded", [{ name: "Facturas", count: counts.inserted + counts.updated }]);
  return { ...counts, fetched, truncated };
}
