// SPDX-License-Identifier: MIT
// Chat tool catalog: the 14 tools the model may call, plus their domain
// isolation and human-approval helpers.

import { tool } from "ai";
import { z } from "zod";
import * as ee from "../ee.server";
import { getDb } from "@/lib/db.server";
import { logger } from "@/lib/logger.server";
import * as schema from "../../../drizzle/schema";

export const DOMAIN = {
  deals: "ventas",
  invoices: "finanzas",
  campaigns: "marketing",
  accounts: "clientes",
} as const;

/**
 * Tools that write something the user cannot get back: Drive files, local
 * files (a whole-file overwrite) and Notion pages (shared with third parties).
 * The chat endpoint maps every name here to `"user-approval"`, which makes the
 * SDK pause the turn and ask before `execute` runs — the card in the UI is the
 * only way to resume it. Keep it in sync with the catalog: a new write tool
 * that is not listed here runs without asking.
 */
export const APPROVAL_REQUIRED = [
  "create_drive_file",
  "update_drive_file",
  "create_local_file",
  "update_local_file",
  "create_notion_page",
  "update_notion_page",
  "append_notion_blocks",
] as const;

/** Result of proposing an action that requires human confirmation. */
export type ProposedAction = {
  eventId: string;
  title: string;
  risk: string;
  items: string[];
  status: "pending";
};

/** Everything the chat tools need from the request scope. */
export interface ChatToolsContext {
  expert: { name: string; sources: string[] };
  expertId: string;
  used: Set<string>;
  allowed: (domain: string) => boolean;
  proposePending: (
    domain: string,
    title: string,
    risk: string,
    items: string[],
    pending: ee.PendingAction,
  ) => Promise<ProposedAction>;
}

/**
 * Business tools only tell the truth about where their data comes from.
 * `connected` is true only when a real integration that feeds the data is
 * connected. The app ships with no business data and no connectors, so tools
 * return a clear note instead of invented figures.
 */
const NO_SOURCE_NOTE =
  "No hay ninguna fuente de negocio conectada. Los datos no son reales: la base local está vacía y los conectores reales están en la hoja de ruta.";

async function sourceStatus(ids: string[]): Promise<{ connected: boolean; name: string | null }> {
  const { orm } = await getDb();
  const hit = orm
    .select()
    .from(schema.integrations)
    .all()
    .find((i) => ids.includes(i.id) && i.connected);
  return { connected: !!hit, name: hit?.name ?? null };
}

function withSource<T extends object>(
  data: T,
  src: { connected: boolean; name: string | null },
): T & { source: string; connected: boolean; note?: string } {
  return {
    ...data,
    source: src.connected ? (src.name ?? "conectado") : "sin conexión",
    connected: src.connected,
    ...(src.connected ? {} : { note: NO_SOURCE_NOTE }),
  };
}

/**
 * A list read that stopped before the end says so: `count` and `hasMore` travel
 * with the results, and `nextCursor` is what the model passes back to continue.
 * Without this, 500 rows out of 900 read as if they were all of them.
 */
type BoundedList = {
  items: { id: string; object: string; title: string; url?: string }[];
  count: number;
  hasMore: boolean;
  nextCursor?: string;
};

function boundedList(list: BoundedList) {
  const next = list.nextCursor;
  return {
    results: list.items,
    count: list.count,
    hasMore: list.hasMore,
    ...(next ? { nextCursor: next } : {}),
    ...(list.hasMore
      ? {
          note: next
            ? `Hay más resultados: repite la llamada con cursor: "${next}".`
            : "Hay más resultados de los que se leen en una llamada: afina la búsqueda.",
        }
      : {}),
  };
}

export function createChatTools(ctx: ChatToolsContext) {
  const { expert, expertId, used, allowed, proposePending } = ctx;

  const deny = (domain: string) => ({
    error: `Fuera de contexto: estos datos pertenecen al Experto "${domain}" y no son accesibles desde "${expert.name}".`,
  });

  return {
    get_pipeline_summary: tool({
      description:
        "Resumen del pipeline comercial: valor abierto, nº de deals, win rate, previsión ponderada, desglose por etapa y deals estancados (>21 días).",
      inputSchema: z.object({}),
      execute: async () => {
        if (!allowed(DOMAIN.deals)) return deny("ventas");
        used.add("CRM");
        const src = await sourceStatus(["pipedrive", "salesforce"]);
        return withSource(await ee.pipelineSummary(), src);
      },
    }),
    list_deals: tool({
      description:
        "Lista deals abiertos del CRM, opcionalmente filtrados por etapa (Cualificación, Demo, Propuesta, Negociación).",
      inputSchema: z.object({ stage: z.string().nullish() }),
      execute: async ({ stage }) => {
        if (!allowed(DOMAIN.deals)) return deny("ventas");
        used.add("CRM");
        const src = await sourceStatus(["pipedrive", "salesforce"]);
        return withSource({ deals: await ee.listDeals(stage ?? null) }, src);
      },
    }),
    list_overdue_invoices: tool({
      description:
        "Facturas vencidas, con importe, días de retraso y reclamaciones ya registradas. Filtra por importe mínimo en euros (opcional).",
      inputSchema: z.object({ minAmount: z.coerce.number().nullish() }),
      execute: async ({ minAmount }) => {
        if (!allowed(DOMAIN.invoices)) return deny("finanzas");
        used.add("Facturación");
        const src = await sourceStatus(["holded"]);
        return withSource({ invoices: await ee.overdueInvoices(minAmount ?? null) }, src);
      },
    }),
    get_campaign_performance: tool({
      description:
        "Rendimiento de campañas publicitarias (últimos 7 días): gasto, conversiones, CPA real vs objetivo y estado.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!allowed(DOMAIN.campaigns)) return deny("marketing");
        used.add("Publicidad");
        const src = await sourceStatus(["meta", "ga"]);
        return withSource({ campaigns: await ee.campaignPerformance() }, src);
      },
    }),
    get_churn_risk: tool({
      description:
        "Riesgo de churn por cuenta cliente: MRR, tendencia de uso, tickets abiertos y probabilidad de baja.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!allowed(DOMAIN.accounts)) return deny("clientes");
        used.add("Clientes");
        const src = await sourceStatus(["salesforce"]);
        return withSource({ accounts: await ee.churnRisk() }, src);
      },
    }),
    propose_invoice_reminders: tool({
      description:
        "Propone registrar una reclamación de cobro en facturas vencidas concretas: al aprobarla, cada factura suma una reclamación. No envía ningún correo y exige confirmación humana.",
      inputSchema: z.object({ invoiceIds: z.union([z.array(z.string()), z.string()]) }),
      execute: async ({ invoiceIds }) => {
        if (!allowed(DOMAIN.invoices)) return deny("finanzas");
        const src = await sourceStatus(["holded"]);
        if (!src.connected) return { error: NO_SOURCE_NOTE };
        const ids = Array.isArray(invoiceIds) ? invoiceIds : [invoiceIds];
        const rows = (await ee.overdueInvoices(null)).filter((i) => ids.includes(i.id));
        if (!rows.length) return { error: "Ninguna de esas facturas está vencida." };
        return proposePending(
          "finanzas",
          `Registrar ${ee.countPhrase(rows.length, "reclamación de cobro", "reclamaciones de cobro")}`,
          "Cobro",
          rows.map(
            (r) =>
              `${r.client} — ${r.amount.toLocaleString("es-ES")}€ · ${r.daysOverdue} días · ${r.id}`,
          ),
          { kind: "invoice_reminders", ids: rows.map((r) => r.id) },
        );
      },
    }),
    propose_pause_campaigns: tool({
      description:
        "Propone pausar campañas publicitarias concretas. NO las pausa: crea una tarjeta de confirmación humana obligatoria.",
      inputSchema: z.object({ campaignIds: z.union([z.array(z.string()), z.string()]) }),
      execute: async ({ campaignIds }) => {
        if (!allowed(DOMAIN.campaigns)) return deny("marketing");
        const src = await sourceStatus(["meta", "ga"]);
        if (!src.connected) return { error: NO_SOURCE_NOTE };
        const ids = Array.isArray(campaignIds) ? campaignIds : [campaignIds];
        const rows = (await ee.campaignPerformance()).filter(
          (x) => ids.includes(x.id) && x.status === "active",
        );
        if (!rows.length) return { error: "No hay campañas activas con esos IDs." };
        return proposePending(
          "marketing",
          `Pausar ${ee.countPhrase(rows.length, "campaña", "campañas")}`,
          "Cambio en campañas",
          rows.map((r) => {
            // Neither a missing CPA nor a missing target may reach the human
            // card as "CPA null€" or "+Infinity%": each one says what it is.
            if (r.cpa === null) {
              return `${r.name} — sin conversiones en 7 días (gasto ${r.spend7d.toLocaleString("es-ES")}€)`;
            }
            if (r.overTargetPct === null) {
              return `${r.name} — CPA ${r.cpa}€, sin objetivo de CPA`;
            }
            return `${r.name} — CPA ${r.cpa}€ (${r.overTargetPct > 0 ? "+" : ""}${r.overTargetPct}%)`;
          }),
          { kind: "pause_campaigns", ids: rows.map((r) => r.id) },
        );
      },
    }),
    open_expert_form: tool({
      description:
        "Muestra al usuario un formulario interactivo para crear un nuevo Experto, con nombre y descripción sugeridos.",
      inputSchema: z.object({ suggestedName: z.string(), suggestedDescription: z.string() }),
      execute: async (i) => ({ form: true, ...i }),
    }),
    search_drive: tool({
      description:
        "Busca por nombre entre los archivos de Google Drive que el usuario eligió con el Picker. " +
        "Devuelve [{id, name, mimeType}] y `total` con cuántas coincidencias hay, aunque solo devuelva las primeras 100: " +
        "si la respuesta trae `hasMore`, la lista viene cortada y hay que acotarla con un `query` más preciso. " +
        "`total` es el número que se cita al usuario, nunca el de los archivos devueltos.",
      inputSchema: z.object({ query: z.string().nullish() }),
      execute: async ({ query }) => {
        if (!expert.sources.includes("gdrive")) return deny("con Google Drive");
        used.add("Google Drive");
        try {
          const local = await import("../engine/local-secrets.server");
          const grants = local.loadGrantedFiles();
          const q = (query ?? "").trim().toLowerCase();
          // The grants are picked one by one, so a broad query («informe») can match more than
          // fits. The cut used to travel as the list: the model read 100 entries, called them
          // the answer and replied that file 101 did not exist.
          const MAX_LISTED = 100;
          const matched = grants.filter((f) => !q || f.name.toLowerCase().includes(q));
          const files = matched
            .slice(0, MAX_LISTED)
            .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType }));
          const note = !matched.length
            ? "No hay archivos que coincidan entre los que elegiste con el Picker."
            : matched.length > files.length
              ? `Se listan ${files.length} de ${matched.length} coincidencias. Acota la búsqueda con un nombre más preciso.`
              : undefined;
          return {
            files,
            total: matched.length,
            ...(matched.length > files.length ? { hasMore: true } : {}),
            ...(note ? { note } : {}),
          };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    read_drive_file: tool({
      description:
        "Lee el contenido de texto de un archivo de Google Drive que el usuario eligió con el Picker (Docs, Sheets como CSV, Slides, PDF, Word/Excel/PowerPoint y texto). " +
        "Devuelve el documento en ventanas de 2000 líneas: si la respuesta trae `hasMore`, vuelve a llamar con `offset: nextOffset` para seguir por donde iba. " +
        "Si además trae `nextCharOffset`, mándalo en `charOffset` con ese mismo `offset`: una línea que no cabe en una lectura se continúa así, y sin ese dato su resto no se puede pedir. " +
        "`totalChars` dice cuántos caracteres tiene el documento entero, para saber cuánto queda.",
      inputSchema: z.object({
        fileId: z.string(),
        offset: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(20000).optional(),
        charOffset: z.number().int().min(0).optional(),
      }),
      execute: async ({ fileId, offset, limit, charOffset }) => {
        if (!expert.sources.includes("gdrive")) return deny("con Google Drive");
        used.add("Google Drive");
        try {
          const d = await import("../drive.server");
          const local = await import("../engine/local-secrets.server");
          const granted = local.loadGrantedFiles().map((g) => g.id);
          // A plain read keeps calling with two arguments: the window is an addition, not a
          // different way of reading.
          const window =
            offset === undefined && limit === undefined && charOffset === undefined
              ? null
              : { offset, limit, charOffset };
          return window
            ? await d.readFile(fileId, granted, window)
            : await d.readFile(fileId, granted);
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    create_drive_file: tool({
      description:
        "Crea un archivo NUEVO en Google Drive. kind: document (Google Doc, content en Markdown), spreadsheet (Google Sheet, content en CSV con cabecera), text o markdown. Devuelve enlace.",
      inputSchema: z.object({
        name: z.string().min(1).max(200),
        content: z.string().max(200000),
        kind: z.enum(["document", "spreadsheet", "text", "markdown"]),
        folderId: z.string().nullish(),
      }),
      execute: async ({ name, content, kind, folderId }) => {
        if (!expert.sources.includes("gdrive")) return deny("con Google Drive");
        used.add("Google Drive");
        try {
          const d = await import("../drive.server");
          const f = await d.createFile(name, content, kind, folderId);
          await ee
            .logActivity({
              actor: "agent",
              actor_name: "OpenExpert",
              type: "Drive · creación",
              expert_id: expertId,
              status: "ok",
              summary: `Creado en Drive: ${f.name}`,
              sources: ["Google Drive"],
            })
            .catch((e: unknown) =>
              logger.error("activity.log_failed", e, { tool: "create_drive_file", expertId }),
            );
          return { action: "created", ...f };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    update_drive_file: tool({
      description:
        "Reemplaza el contenido completo de un archivo existente de Google Drive (lee antes con read_drive_file y envía la versión completa). Docs en Markdown, Sheets en CSV.",
      inputSchema: z.object({
        fileId: z.string(),
        content: z.string().max(200000),
        newName: z.string().nullish(),
      }),
      execute: async ({ fileId, content, newName }) => {
        if (!expert.sources.includes("gdrive")) return deny("con Google Drive");
        used.add("Google Drive");
        try {
          const d = await import("../drive.server");
          const local = await import("../engine/local-secrets.server");
          const granted = local.loadGrantedFiles().map((g) => g.id);
          const f = await d.updateFile(fileId, content, granted, newName);
          await ee
            .logActivity({
              actor: "agent",
              actor_name: "OpenExpert",
              type: "Drive · edición",
              expert_id: expertId,
              status: "ok",
              summary: `Editado en Drive: ${f.name}`,
              sources: ["Google Drive"],
            })
            .catch((e: unknown) =>
              logger.error("activity.log_failed", e, { tool: "update_drive_file", expertId }),
            );
          return { action: "updated", ...f };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    list_local_files: tool({
      description:
        "Lista los archivos de las carpetas locales que el usuario autorizó (ruta, nombre y tamaño). Devuelve los primeros 200 y el total; si el recorrido se corta en su tope, lo dice (`truncated: true`) y el total no es el de la carpeta. Si hay más, acota con search_local_files.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!expert.sources.includes("local")) return deny("con archivos locales");
        used.add("Archivos locales");
        try {
          const MAX_LISTED = 200;
          const local = await import("../engine/local-secrets.server");
          const fs = await import("../local-fs.server");
          const roots = local.loadLocalRoots().map((r) => r.path);
          const walk = fs.listLocalFiles(roots);
          const all = walk.files;
          // A folder with thousands of files used to dump every entry into the context, where it
          // costs tokens and buries the one file the question is about. The total still travels, so
          // nothing is hidden — only paged.
          const files = all.slice(0, MAX_LISTED);
          // The walk has caps too, and they are not the size of the folder: `total` on a truncated
          // walk would be «5000 archivos» for a folder of 20 000, and the model repeated it.
          const note = walk.truncated
            ? `Se listan ${files.length} archivos de los ${all.length} recorridos, y el recorrido se ha cortado en el tope de ${fs.MAX_WALK_FILES_TEXT}: la carpeta puede tener más. Acota con search_local_files.`
            : all.length > files.length
              ? `Se listan ${files.length} de ${all.length} archivos. Acota con search_local_files.`
              : null;
          return {
            roots,
            ...(walk.truncated ? { truncated: true, scanned: all.length } : { total: all.length }),
            files,
            ...(note ? { note } : {}),
          };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    search_local_files: tool({
      description:
        "Busca archivos por NOMBRE en las carpetas locales autorizadas. Devuelve [{path, name, size}] y `total` con cuántos coinciden, aunque solo enseñe los primeros 200.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        if (!expert.sources.includes("local")) return deny("con archivos locales");
        used.add("Archivos locales");
        try {
          const MAX_LISTED = 200;
          const local = await import("../engine/local-secrets.server");
          const fs = await import("../local-fs.server");
          const roots = local.loadLocalRoots().map((r) => r.path);
          const q = query.trim().toLowerCase();
          const walk = fs.listLocalFiles(roots);
          // Count every match in the walk, not just the ones that fit: «200» read as the answer is
          // how the 201st file became «no existe».
          const matched = walk.files.filter((f) => f.name.toLowerCase().includes(q));
          const files = matched.slice(0, MAX_LISTED);
          const notes: string[] = [];
          if (walk.truncated) {
            notes.push(
              `Se listan ${files.length} de ${matched.length} coincidencias dentro del recorrido, que se ha cortado en el tope de ${fs.MAX_WALK_FILES_TEXT} archivos: puede haber más archivos sin mirar. Acota con una subcarpeta.`,
            );
          } else if (matched.length > files.length) {
            notes.push(
              `Se listan ${files.length} de ${matched.length} coincidencias. Acota la búsqueda.`,
            );
          }
          return {
            files,
            // On a truncated walk the count is a floor, so it does not travel as `total`.
            ...(walk.truncated ? { truncated: true } : { total: matched.length }),
            ...(notes.length ? { note: notes.join(" ") } : {}),
          };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    search_inside_files: tool({
      description:
        "Busca un texto DENTRO del contenido de los archivos locales autorizados (por contenido, no por nombre: para el nombre está search_local_files). " +
        "Devuelve [{path, name, line, text}] con la línea exacta donde aparece, sin distinguir mayúsculas ni tildes. " +
        "Úsalo para saber dónde se menciona un cliente, una factura o un importe, y después lee esas líneas con read_local_file usando `offset`.",
      inputSchema: z.object({ query: z.string().min(2) }),
      execute: async ({ query }) => {
        if (!expert.sources.includes("local")) return deny("con archivos locales");
        used.add("Archivos locales");
        try {
          const local = await import("../engine/local-secrets.server");
          const fs = await import("../local-fs.server");
          const roots = local.loadLocalRoots().map((r) => r.path);
          return await fs.searchLocalContent(roots, query);
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    run_python: tool({
      description:
        "Ejecuta un script corto de Python y devuelve lo que imprime. Úsalo para **calcular**: sumar una columna, agrupar por meses, sacar un porcentaje o un total. " +
        "Lee los datos con read_local_file y deja que el cálculo lo haga el script: sumar a ojo sobre cientos de filas sale mal, y sale mal con seguridad. " +
        "El script corre en un directorio temporal propio, dentro de un espacio de nombres sin red y sin las variables de entorno de la aplicación, con un límite de 30 segundos (hasta 120). " +
        "Necesita `bubblewrap` para ver solo ese directorio: si la máquina no lo tiene (o no puede crear los espacios de nombres), el script no se ejecuta y el resultado dice cómo instalarlo. " +
        "Cuenta solo con la biblioteca estándar de Python: no des por hecho pandas ni nada que haya que instalar.",
      inputSchema: z.object({
        code: z.string().min(1).max(20000),
        timeoutMs: z.number().int().min(1000).max(120000).optional(),
      }),
      execute: async ({ code, timeoutMs }) => {
        if (!expert.sources.includes("python")) return deny("con Python");
        used.add("Python");
        try {
          const py = await import("../python.server");
          const run = await py.runPython(code, { timeoutMs });
          // The script itself goes to the activity trail: running code is the one action where the
          // audit record is not a nicety but the way to answer "what did it actually run?".
          // It goes whole: the tool schema already caps it at 20 000 characters, which fits in the
          // snapshot, so a cut here would only make the trail describe a script that never ran. If a
          // size cap is ever needed, it is announced (`truncated`, total and kept characters), never
          // silent.
          // The duration is the one the run measured, not a placeholder.
          await ee
            .logActivity({
              actor: "agent",
              actor_name: "OpenExpert",
              type: "Python · ejecución",
              expert_id: expertId,
              status: run.ok ? "ok" : "failed",
              summary: `Script de Python (${run.durationMs} ms, salida ${run.exit ?? "-"})`,
              sources: ["Python"],
              duration_ms: run.durationMs,
              snapshot: { script: code },
            })
            .catch((e: unknown) =>
              logger.error("activity.log_failed", e, { tool: "run_python", expertId }),
            );
          return run;
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    read_local_file: tool({
      description:
        "Lee el contenido de un archivo local autorizado (texto, PDF, Word, Excel y PowerPoint). Pasa la ruta que devuelve list_local_files o search_local_files. " +
        "Devuelve el archivo en ventanas de 2000 líneas: si la respuesta trae `hasMore`, vuelve a llamar con `offset: nextOffset` para seguir por donde iba. " +
        "Si además trae `nextCharOffset`, mándalo en `charOffset` con ese mismo `offset`: una línea que no cabe en una lectura se continúa así, y sin ese dato su resto no se puede pedir. " +
        "En hojas de cálculo y CSV devuelve además `sheets`, con el nombre de cada hoja, cuántas filas de datos tiene (la cabecera va en `columns` y no se cuenta como fila) y cómo se llaman esas columnas.",
      inputSchema: z.object({
        path: z.string(),
        offset: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(20000).optional(),
        charOffset: z.number().int().min(0).optional(),
        onVision: z
          .boolean()
          .optional()
          .describe("Marcar sólo cuando haga falta leer un PDF escaneado: mándalo al modelo."),
      }),
      execute: async ({ path, offset, limit, charOffset, onVision }) => {
        if (!expert.sources.includes("local")) return deny("con archivos locales");
        used.add("Archivos locales");
        try {
          const local = await import("../engine/local-secrets.server");
          const fs = await import("../local-fs.server");
          const roots = local.loadLocalRoots().map((r) => r.path);
          // The setting is read here, in the tool layer, so the filesystem module never has to know
          // about configuration: a read that wants vision says so.
          const vision = onVision
            ? (await import("../config.server")).chatSettings().visionPdf
            : false;
          const window =
            offset === undefined && limit === undefined && charOffset === undefined
              ? vision
                ? { vision }
                : null
              : { offset, limit, charOffset, ...(vision ? { vision } : {}) };
          // A plain read keeps calling with two arguments: the window is an addition, not a
          // different way of reading.
          return window
            ? await fs.readLocalFile(path, roots, window)
            : await fs.readLocalFile(path, roots);
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    create_local_file: tool({
      description:
        "Crea un archivo NUEVO dentro de una carpeta local autorizada. Requiere aprobación humana antes de escribir.",
      inputSchema: z.object({
        folder: z.string(),
        name: z.string().min(1).max(200),
        content: z.string().max(200000),
      }),
      execute: async ({ folder, name, content }) => {
        if (!expert.sources.includes("local")) return deny("con archivos locales");
        used.add("Archivos locales");
        try {
          const local = await import("../engine/local-secrets.server");
          const fs = await import("../local-fs.server");
          const roots = local.loadLocalRoots().map((r) => r.path);
          const f = fs.createLocalFile(folder, name, roots, content);
          await ee
            .logActivity({
              actor: "agent",
              actor_name: "OpenExpert",
              type: "Archivos locales · creación",
              expert_id: expertId,
              status: "ok",
              summary: `Creado archivo local: ${f.name}`,
              sources: ["Archivos locales"],
            })
            .catch((e: unknown) =>
              logger.error("activity.log_failed", e, { tool: "create_local_file", expertId }),
            );
          return { action: "created", ...f };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    update_local_file: tool({
      description:
        "Reemplaza el contenido completo de un archivo local autorizado. Requiere aprobación humana antes de escribir.",
      inputSchema: z.object({ path: z.string(), content: z.string().max(200000) }),
      execute: async ({ path, content }) => {
        if (!expert.sources.includes("local")) return deny("con archivos locales");
        used.add("Archivos locales");
        try {
          const local = await import("../engine/local-secrets.server");
          const fs = await import("../local-fs.server");
          const roots = local.loadLocalRoots().map((r) => r.path);
          const f = fs.writeLocalFile(path, roots, content);
          await ee
            .logActivity({
              actor: "agent",
              actor_name: "OpenExpert",
              type: "Archivos locales · edición",
              expert_id: expertId,
              status: "ok",
              summary: `Editado archivo local: ${f.name}`,
              sources: ["Archivos locales"],
            })
            .catch((e: unknown) =>
              logger.error("activity.log_failed", e, { tool: "update_local_file", expertId }),
            );
          return { action: "updated", ...f };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    search_notion: tool({
      description:
        "Busca en el Notion del usuario (solo lo que compartió con OpenExpert): páginas, bases de datos y fuentes de datos. Devuelve {results, count, hasMore, nextCursor}; fíjate en `object` (page / database / data_source). Una llamada lee hasta 5 páginas de 100 resultados: si `hasMore` es true la lista no está completa y sigues con `cursor: nextCursor`.",
      inputSchema: z.object({
        query: z.string(),
        type: z.enum(["page", "data_source"]).nullish(),
        cursor: z.string().optional().describe("El nextCursor de la llamada anterior."),
      }),
      execute: async ({ query, type, cursor }) => {
        if (!expert.sources.includes("notion")) return deny("con Notion");
        used.add("Notion");
        try {
          const n = await import("../notion.server");
          const list = await n.search(query, type ?? undefined, cursor ? { cursor } : {});
          return boundedList(list);
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    query_notion_database: tool({
      description:
        "Lista las filas (páginas) de una fuente de datos de Notion por su id (el id que devuelve search_notion con object=data_source). Acepta filter/sorts en el formato de la API de Notion. Para 'tareas pendientes', usa antes describe_notion_data_source y filtra por la propiedad de estado. Devuelve {results, count, hasMore, nextCursor}: `pageSize` son filas por petición (máx. 100) y una llamada recorre hasta 5 páginas; si `hasMore` es true, sigue con `cursor: nextCursor` en vez de dar la lista por completa.",
      inputSchema: z.object({
        databaseId: z.string(),
        filter: z.unknown().optional(),
        sorts: z.unknown().optional(),
        pageSize: z.coerce.number().int().min(1).max(100).optional(),
        cursor: z.string().optional().describe("El nextCursor de la llamada anterior."),
      }),
      execute: async ({ databaseId, filter, sorts, pageSize, cursor }) => {
        if (!expert.sources.includes("notion")) return deny("con Notion");
        used.add("Notion");
        try {
          const n = await import("../notion.server");
          const opts: {
            filter?: unknown;
            sorts?: unknown;
            pageSize?: number;
            cursor?: string;
          } = {};
          if (filter !== undefined) opts.filter = filter;
          if (sorts !== undefined) opts.sorts = sorts;
          if (pageSize !== undefined) opts.pageSize = pageSize;
          if (cursor !== undefined) opts.cursor = cursor;
          return boundedList(await n.queryDataSource(databaseId, opts));
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    describe_notion_data_source: tool({
      description:
        "Devuelve el esquema de una fuente de datos de Notion (nombres y tipos de sus propiedades). Úsalo para saber por qué propiedad filtrar antes de query_notion_database.",
      inputSchema: z.object({ dataSourceId: z.string() }),
      execute: async ({ dataSourceId }) => {
        if (!expert.sources.includes("notion")) return deny("con Notion");
        used.add("Notion");
        try {
          const n = await import("../notion.server");
          return await n.describeDataSource(dataSourceId);
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    read_notion_page: tool({
      description:
        "Lee el texto de una PÁGINA de Notion por su id (incluye los bloques anidados hasta cuatro niveles: página, hijos, nietos y bisnietos). El id debe ser una página (una fila devuelta por query_notion_database, object=page); no pases un id de fuente de datos. Devuelve content, blocks y hasMore: si `hasMore` es true el texto es parcial, y el motivo puede ser el número de bloques (300 por defecto: sigues con `maxBlocks` mayor, hasta 1000) o el anidamiento (hay bloques con hijos por debajo del cuarto nivel: ahí subir `maxBlocks` no lee más, y no lo presentes como la página entera).",
      inputSchema: z.object({
        pageId: z.string(),
        maxBlocks: z.coerce
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("Bloques que leer como máximo (300 por defecto)."),
      }),
      execute: async ({ pageId, maxBlocks }) => {
        if (!expert.sources.includes("notion")) return deny("con Notion");
        used.add("Notion");
        try {
          const n = await import("../notion.server");
          const page = await n.readPage(pageId, maxBlocks ? { maxBlocks } : {});
          const notes: string[] = [];
          if (!page.content) notes.push("La página no contiene texto.");
          if (page.hasMore)
            notes.push(
              `Se han leído ${page.blocks} bloques y la página tiene más: si el corte es por número de bloques, repite la llamada con maxBlocks mayor (hasta 1000); si viene de bloques anidados (se leen cuatro niveles), subir maxBlocks no añade nada y el texto de los niveles más hondos no se ha leído.`,
            );
          return {
            pageId,
            content: page.content || null,
            blocks: page.blocks,
            hasMore: page.hasMore,
            ...(notes.length ? { note: notes.join(" ") } : {}),
          };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    create_notion_page: tool({
      description:
        "Crea una página en una base de datos de Notion. properties sigue el formato de la API de Notion. Requiere aprobación humana.",
      inputSchema: z.object({
        databaseId: z.string(),
        properties: z.record(z.string(), z.unknown()),
      }),
      execute: async ({ databaseId, properties }) => {
        if (!expert.sources.includes("notion")) return deny("con Notion");
        used.add("Notion");
        try {
          const n = await import("../notion.server");
          const page = await n.createPage(databaseId, properties);
          await ee
            .logActivity({
              actor: "agent",
              actor_name: "OpenExpert",
              type: "Notion · creación",
              expert_id: expertId,
              status: "ok",
              summary: `Creada página en Notion: ${page.title}`,
              sources: ["Notion"],
            })
            .catch((e: unknown) =>
              logger.error("activity.log_failed", e, { tool: "create_notion_page", expertId }),
            );
          return { action: "created", ...page };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    update_notion_page: tool({
      description:
        "Actualiza las propiedades de una página de Notion. properties sigue el formato de la API de Notion. Requiere aprobación humana.",
      inputSchema: z.object({ pageId: z.string(), properties: z.record(z.string(), z.unknown()) }),
      execute: async ({ pageId, properties }) => {
        if (!expert.sources.includes("notion")) return deny("con Notion");
        used.add("Notion");
        try {
          const n = await import("../notion.server");
          const page = await n.updatePage(pageId, properties);
          await ee
            .logActivity({
              actor: "agent",
              actor_name: "OpenExpert",
              type: "Notion · edición",
              expert_id: expertId,
              status: "ok",
              summary: `Actualizada página en Notion: ${page.title}`,
              sources: ["Notion"],
            })
            .catch((e: unknown) =>
              logger.error("activity.log_failed", e, { tool: "update_notion_page", expertId }),
            );
          return { action: "updated", ...page };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    append_notion_blocks: tool({
      description:
        "Añade bloques de contenido al final de una página de Notion. children sigue el formato de la API de Notion. Requiere aprobación humana.",
      inputSchema: z.object({ pageId: z.string(), children: z.array(z.unknown()) }),
      execute: async ({ pageId, children }) => {
        if (!expert.sources.includes("notion")) return deny("con Notion");
        used.add("Notion");
        try {
          const n = await import("../notion.server");
          const r = await n.appendBlocks(pageId, children);
          await ee
            .logActivity({
              actor: "agent",
              actor_name: "OpenExpert",
              type: "Notion · edición",
              expert_id: expertId,
              status: "ok",
              summary: "Añadidos bloques a una página de Notion",
              sources: ["Notion"],
            })
            .catch((e: unknown) =>
              logger.error("activity.log_failed", e, { tool: "append_notion_blocks", expertId }),
            );
          return { action: "appended", ...r };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
  };
}
