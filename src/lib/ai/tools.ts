// SPDX-License-Identifier: MIT
// Chat tool catalog: the 14 tools the model may call, plus their domain
// isolation and human-approval helpers.

import { tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as ee from "../ee.server";
import { getDb } from "@/lib/db.server";
import * as schema from "../../../drizzle/schema";

export const DOMAIN = {
  deals: "ventas",
  invoices: "finanzas",
  campaigns: "marketing",
  accounts: "general",
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
        used.add("Pipedrive");
        return ee.pipelineSummary();
      },
    }),
    list_deals: tool({
      description:
        "Lista deals abiertos del CRM, opcionalmente filtrados por etapa (Cualificación, Demo, Propuesta, Negociación).",
      inputSchema: z.object({ stage: z.string().nullable() }),
      execute: async ({ stage }) => {
        if (!allowed(DOMAIN.deals)) return deny("ventas");
        used.add("Pipedrive");
        return { deals: await ee.listDeals(stage) };
      },
    }),
    list_overdue_invoices: tool({
      description:
        "Facturas vencidas, con importe, días de retraso y recordatorios enviados. Filtra por importe mínimo en euros.",
      inputSchema: z.object({ minAmount: z.number().nullable() }),
      execute: async ({ minAmount }) => {
        if (!allowed(DOMAIN.invoices)) return deny("finanzas");
        used.add("Holded");
        return { invoices: await ee.overdueInvoices(minAmount) };
      },
    }),
    get_campaign_performance: tool({
      description:
        "Rendimiento de campañas publicitarias (últimos 7 días): gasto, conversiones, CPA real vs objetivo y estado.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!allowed(DOMAIN.campaigns)) return deny("marketing");
        used.add("Meta Ads");
        return { campaigns: await ee.campaignPerformance() };
      },
    }),
    get_churn_risk: tool({
      description:
        "Riesgo de churn por cuenta cliente: MRR, tendencia de uso, tickets abiertos y probabilidad de baja.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!allowed(DOMAIN.accounts)) return deny("general");
        return { accounts: await ee.churnRisk() };
      },
    }),
    list_processes: tool({
      description:
        "Catálogo de procesos autónomos con su disparador, nivel de aprobación y estado.",
      inputSchema: z.object({}),
      execute: async () => {
        const { orm: db } = await getDb();
        const processes = db
          .select()
          .from(schema.processes)
          .all()
          .filter((p) => allowed(p.expertId));
        return {
          processes: processes.map((p) => ({
            id: p.id,
            name: p.name,
            trigger: p.trigger,
            approval: p.approval,
            expert_id: p.expertId,
            active: p.active,
            runs: p.runs,
          })),
        };
      },
    }),
    propose_invoice_reminders: tool({
      description:
        "Propone enviar reclamaciones de cobro por email para facturas vencidas concretas. NO las envía: crea una tarjeta de confirmación humana obligatoria.",
      inputSchema: z.object({ invoiceIds: z.array(z.string()) }),
      execute: async ({ invoiceIds }) => {
        if (!allowed(DOMAIN.invoices)) return deny("finanzas");
        const rows = (await ee.overdueInvoices(null)).filter((i) => invoiceIds.includes(i.id));
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
      inputSchema: z.object({ campaignIds: z.array(z.string()) }),
      execute: async ({ campaignIds }) => {
        if (!allowed(DOMAIN.campaigns)) return deny("marketing");
        const rows = (await ee.campaignPerformance()).filter(
          (x) => campaignIds.includes(x.id) && x.status === "active",
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
    request_process_run: tool({
      description:
        "Solicita ejecutar un proceso autónomo por su id. Si requiere aprobación, crea una tarjeta de confirmación.",
      inputSchema: z.object({ processId: z.string() }),
      execute: async ({ processId }) => {
        const p = (await getDb()).orm
          .select()
          .from(schema.processes)
          .where(eq(schema.processes.id, processId))
          .all()[0];
        if (!p) return { error: "Proceso no encontrado" };
        if (!allowed(p.expertId)) return deny(p.expertId);
        if (!p.active) return { error: "El proceso está desactivado" };
        return proposePending(
          p.expertId,
          `Ejecutar proceso "${p.name}"`,
          "Ejecución de proceso",
          [
            `Disparador: ${p.trigger}`,
            `Aprobación: ${p.approval}`,
            ...p.stages.map((s, i) => `${i + 1}. ${s}`),
          ],
          { kind: "run_process", ids: [processId] },
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
      inputSchema: z.object({ query: z.string().nullable() }),
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
        "Lee el contenido de texto de un archivo de Google Drive que el usuario eligió con el Picker (Docs, Sheets como CSV, Slides, PDF, texto).",
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
        folderId: z.string().nullable(),
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
        newName: z.string().nullable(),
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
  };
}
