// SPDX-License-Identifier: MIT
// Chat tool catalog: the 14 tools the model may call, plus their domain
// isolation and human-approval helpers.

import { tool } from "ai";
import { z } from "zod";
import * as ee from "../ee.server";
import { getDb } from "@/lib/db.server";
import * as schema from "../../../drizzle/schema";

export const DOMAIN = {
  deals: "ventas",
  invoices: "finanzas",
  campaigns: "marketing",
  accounts: "clientes",
} as const;

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
        "Facturas vencidas, con importe, días de retraso y recordatorios enviados. Filtra por importe mínimo en euros (opcional).",
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
        "Propone enviar reclamaciones de cobro por email para facturas vencidas concretas. NO las envía: crea una tarjeta de confirmación humana obligatoria.",
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
          `Enviar ${rows.length} reclamaciones de cobro`,
          "Envío de correo",
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
          `Pausar ${rows.length} campañas`,
          "Cambio en campañas",
          rows.map(
            (r) =>
              `${r.name} — CPA ${r.cpa}€ (${r.overTargetPct! > 0 ? "+" : ""}${r.overTargetPct}%)`,
          ),
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
        "Busca por nombre entre los archivos de Google Drive que el usuario eligió con el Picker. Devuelve [{id, name, mimeType}].",
      inputSchema: z.object({ query: z.string().nullish() }),
      execute: async ({ query }) => {
        if (!expert.sources.includes("gdrive")) return deny("con Google Drive");
        used.add("Google Drive");
        try {
          const local = await import("../opencore/local-secrets.server");
          const grants = local.loadGrantedFiles();
          const q = (query ?? "").trim().toLowerCase();
          const files = grants
            .filter((f) => !q || f.name.toLowerCase().includes(q))
            .slice(0, 100)
            .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType }));
          return {
            files,
            note: files.length
              ? undefined
              : "No hay archivos que coincidan entre los que elegiste con el Picker.",
          };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    read_drive_file: tool({
      description:
        "Lee el contenido de texto de un archivo de Google Drive que el usuario eligió con el Picker (Docs, Sheets como CSV, Slides, PDF, Word/Excel/PowerPoint y texto).",
      inputSchema: z.object({ fileId: z.string() }),
      execute: async ({ fileId }) => {
        if (!expert.sources.includes("gdrive")) return deny("con Google Drive");
        used.add("Google Drive");
        try {
          const d = await import("../drive.server");
          const local = await import("../opencore/local-secrets.server");
          const granted = local.loadGrantedFiles().map((g) => g.id);
          return await d.readFile(fileId, granted);
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
            .catch(() => {});
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
          const local = await import("../opencore/local-secrets.server");
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
            .catch(() => {});
          return { action: "updated", ...f };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    list_local_files: tool({
      description:
        "Lista los archivos de las carpetas locales que el usuario autorizó (ruta, nombre y tamaño). Úsalo antes de leer para localizar el archivo.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!expert.sources.includes("local")) return deny("con archivos locales");
        used.add("Archivos locales");
        try {
          const local = await import("../opencore/local-secrets.server");
          const fs = await import("../local-fs.server");
          const roots = local.loadLocalRoots().map((r) => r.path);
          const files = fs.listLocalFiles(roots);
          return { roots, files };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    search_local_files: tool({
      description:
        "Busca archivos por NOMBRE en las carpetas locales autorizadas. Devuelve [{path, name, size}].",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        if (!expert.sources.includes("local")) return deny("con archivos locales");
        used.add("Archivos locales");
        try {
          const local = await import("../opencore/local-secrets.server");
          const fs = await import("../local-fs.server");
          const roots = local.loadLocalRoots().map((r) => r.path);
          const q = query.trim().toLowerCase();
          const files = fs
            .listLocalFiles(roots)
            .filter((f) => f.name.toLowerCase().includes(q))
            .slice(0, 200);
          return { files };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    read_local_file: tool({
      description:
        "Lee el contenido de texto de un archivo local autorizado (texto, PDF, Word, Excel y PowerPoint). Pasa la ruta devuelta por list_local_files o search_local_files.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        if (!expert.sources.includes("local")) return deny("con archivos locales");
        used.add("Archivos locales");
        try {
          const local = await import("../opencore/local-secrets.server");
          const fs = await import("../local-fs.server");
          const roots = local.loadLocalRoots().map((r) => r.path);
          return await fs.readLocalFile(path, roots);
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
          const local = await import("../opencore/local-secrets.server");
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
            .catch(() => {});
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
          const local = await import("../opencore/local-secrets.server");
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
            .catch(() => {});
          return { action: "updated", ...f };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    search_notion: tool({
      description:
        "Busca en el Notion del usuario (solo lo que compartió con OpenExpert): páginas, bases de datos y fuentes de datos. Devuelve [{id, object, title, url}]; fíjate en `object` (page / database / data_source).",
      inputSchema: z.object({
        query: z.string(),
        type: z.enum(["page", "data_source"]).nullish(),
      }),
      execute: async ({ query, type }) => {
        if (!expert.sources.includes("notion")) return deny("con Notion");
        used.add("Notion");
        try {
          const n = await import("../notion.server");
          return { results: await n.search(query, type ?? undefined) };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    query_notion_database: tool({
      description:
        "Lista las filas (páginas) de una fuente de datos de Notion por su id (el id que devuelve search_notion con object=data_source). Acepta filter/sorts en el formato de la API de Notion. Para 'tareas pendientes', usa antes describe_notion_data_source y filtra por la propiedad de estado. Devuelve [{id, title, url}].",
      inputSchema: z.object({
        databaseId: z.string(),
        filter: z.unknown().optional(),
        sorts: z.unknown().optional(),
        pageSize: z.coerce.number().int().min(1).max(100).optional(),
      }),
      execute: async ({ databaseId, filter, sorts, pageSize }) => {
        if (!expert.sources.includes("notion")) return deny("con Notion");
        used.add("Notion");
        try {
          const n = await import("../notion.server");
          const opts: { filter?: unknown; sorts?: unknown; pageSize?: number } = {};
          if (filter !== undefined) opts.filter = filter;
          if (sorts !== undefined) opts.sorts = sorts;
          if (pageSize !== undefined) opts.pageSize = pageSize;
          return { results: await n.queryDataSource(databaseId, opts) };
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
        "Lee el texto de una PÁGINA de Notion por su id (incluye bloques anidados). El id debe ser una página (una fila devuelta por query_notion_database, object=page); no pases un id de fuente de datos.",
      inputSchema: z.object({ pageId: z.string() }),
      execute: async ({ pageId }) => {
        if (!expert.sources.includes("notion")) return deny("con Notion");
        used.add("Notion");
        try {
          const n = await import("../notion.server");
          const text = await n.readPage(pageId);
          return {
            pageId,
            content: text || null,
            ...(text ? {} : { note: "La página no contiene texto." }),
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
            .catch(() => {});
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
            .catch(() => {});
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
            .catch(() => {});
          return { action: "appended", ...r };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
  };
}
