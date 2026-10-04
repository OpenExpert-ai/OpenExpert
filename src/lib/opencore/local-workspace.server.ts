// SPDX-License-Identifier: MIT
// Local-mode data layer. Builds the workspace the UI needs from JSON files in
// OPENEXPERT_DATA_DIR, seeding example (non-business) content on first run.
// Cloud mode keeps using Supabase; nothing here runs unless OPENEXPERT_MODE=local.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LOCAL_OWNER_ID } from "@openexpert/opencore/mode";

export type LocalTable = "experts" | "processes" | "integrations" | "activity" | "chat_messages";

function dataDir(): string {
  const raw = process.env["OPENEXPERT_DATA_DIR"] || "~/.openexpert";
  const home = process.env["HOME"] || process.env["USERPROFILE"] || ".";
  const dir = raw.startsWith("~/") ? join(home, raw.slice(2)) : raw;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function fileFor(table: LocalTable): string {
  return join(dataDir(), `${table}.json`);
}

export function readLocalTable(table: LocalTable): Record<string, unknown>[] {
  const f = fileFor(table);
  if (!existsSync(f)) return [];
  try {
    const v = JSON.parse(readFileSync(f, "utf8")) as unknown;
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalTable(table: LocalTable, rows: Record<string, unknown>[]): void {
  writeFileSync(fileFor(table), JSON.stringify(rows, null, 2));
}

export function appendLocalRows(table: LocalTable, rows: Record<string, unknown>[]): void {
  writeLocalTable(table, [...readLocalTable(table), ...rows]);
}

const now = () => new Date().toISOString();

const DEFAULT_EXPERTS = [
  {
    id: "general",
    name: "General",
    description:
      "Dirección: indicadores consolidados y OKR. Consulta datos de todos los dominios para los que tengas permiso.",
    sources: ["gdrive"],
    created_at: now(),
  },
  {
    id: "ventas",
    name: "Ventas",
    description: "CRM, pipeline, leads y previsión comercial.",
    sources: [],
    created_at: now(),
  },
  {
    id: "finanzas",
    name: "Finanzas",
    description: "Facturación, conciliación y tesorería.",
    sources: ["gdrive"],
    created_at: now(),
  },
  {
    id: "marketing",
    name: "Marketing",
    description: "Campañas, inversión y atribución.",
    sources: ["gdrive"],
    created_at: now(),
  },
];

const DEFAULT_PROCESSES = [
  {
    id: "p-overdue-invoices",
    name: "Seguimiento de facturas vencidas",
    description: "Detecta facturas vencidas y propone reclamaciones de cobro.",
    trigger: "Evento · factura vence +7 días",
    stages: ["Detectar", "Priorizar", "Proponer reclamación"],
    limits: ["Requiere aprobación humana"],
    approval: "Requerida",
    expert_id: "finanzas",
    active: true,
    runs: 0,
    last_run: null,
  },
  {
    id: "p-campaign-efficiency",
    name: "Eficiencia de campañas",
    description: "Señala campañas que superan su CPA objetivo y propone pausarlas.",
    trigger: "Umbral · CPA > objetivo +30 %",
    stages: ["Medir CPA", "Comparar objetivo", "Proponer pausa"],
    limits: ["Requiere aprobación humana"],
    approval: "Requerida",
    expert_id: "marketing",
    active: true,
    runs: 0,
    last_run: null,
  },
  {
    id: "p-pipeline-health",
    name: "Salud del pipeline",
    description: "Resumen semanal del pipeline y oportunidades estancadas.",
    trigger: "Cron · viernes 17:00",
    stages: ["Leer pipeline", "Detectar estancadas", "Resumir"],
    limits: [],
    approval: "Ninguna",
    expert_id: "ventas",
    active: true,
    runs: 0,
    last_run: null,
  },
];

const DEFAULT_INTEGRATIONS = [
  {
    id: "gdrive",
    name: "Google Drive",
    category: "Productividad",
    connected: false,
    entities: {},
    last_sync: null,
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    category: "CRM",
    connected: false,
    entities: {},
    last_sync: null,
  },
  {
    id: "salesforce",
    name: "Salesforce",
    category: "CRM",
    connected: false,
    entities: {},
    last_sync: null,
  },
  {
    id: "holded",
    name: "Holded",
    category: "ERP / Finanzas",
    connected: false,
    entities: {},
    last_sync: null,
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "Productividad",
    connected: false,
    entities: {},
    last_sync: null,
  },
  {
    id: "slack",
    name: "Slack",
    category: "Productividad",
    connected: false,
    entities: {},
    last_sync: null,
  },
  {
    id: "ga",
    name: "Google Analytics",
    category: "Publicidad",
    connected: false,
    entities: {},
    last_sync: null,
  },
  {
    id: "meta",
    name: "Meta Ads",
    category: "Publicidad",
    connected: false,
    entities: {},
    last_sync: null,
  },
];

/** Seed example content on first run so the UI is not empty. */
export function seedLocalData(): void {
  if (readLocalTable("experts").length === 0) writeLocalTable("experts", DEFAULT_EXPERTS);
  if (readLocalTable("processes").length === 0) writeLocalTable("processes", DEFAULT_PROCESSES);
  if (readLocalTable("integrations").length === 0)
    writeLocalTable("integrations", DEFAULT_INTEGRATIONS);
}

type ActivityRow = Record<string, unknown> & { snapshot?: unknown };

export function localWorkspace() {
  seedLocalData();
  const experts = readLocalTable("experts");
  const processes = readLocalTable("processes");
  const integrations = readLocalTable("integrations").map((i) => ({
    ...i,
    connected:
      i["id"] === "gdrive" ? existsSync(join(dataDir(), "credentials.json")) : i["connected"],
  }));
  const activity = (readLocalTable("activity") as ActivityRow[]).map((a) => ({
    ...a,
    hasSnapshot: !!(a.snapshot as { entries?: unknown[] } | null)?.entries?.length,
    pending: (a.snapshot as { pending?: unknown } | null)?.pending ?? null,
    snapshot: undefined,
  }));

  return {
    meId: LOCAL_OWNER_ID,
    experts,
    users: [
      {
        id: LOCAL_OWNER_ID,
        name: "Propietario local",
        email: "",
        title: "Administrador",
        created_at: now(),
        role: "ADMIN" as const,
        access: {} as Record<string, "none" | "read" | "exec">,
      },
    ],
    integrations,
    processes,
    activity,
    invitations: [],
    invoices: [],
    campaigns: [],
  };
}

type LocalMessage = {
  user_id?: string;
  expert_id?: string;
  conversation_id?: string;
  message: { role?: string; parts?: { type: string; text?: string }[] };
  created_at?: string;
};

const RETENTION_MS = 30 * 24 * 3600 * 1000;

export function localConversations(expertId: string) {
  const rows = (readLocalTable("chat_messages") as LocalMessage[]).filter(
    (r) => r.expert_id === expertId,
  );
  const map = new Map<string, { id: string; title: string; updatedAt: string; count: number }>();
  for (const r of rows) {
    const id = r.conversation_id ?? "default";
    const cur = map.get(id) ?? { id, title: "", updatedAt: r.created_at ?? now(), count: 0 };
    if (!cur.title && r.message.role === "user") {
      cur.title = (r.message.parts ?? [])
        .map((p) => (p.type === "text" ? (p.text ?? "") : ""))
        .join("")
        .slice(0, 80);
    }
    cur.updatedAt = r.created_at ?? cur.updatedAt;
    cur.count++;
    map.set(id, cur);
  }
  const cutoff = Date.now() - RETENTION_MS;
  return [...map.values()]
    .filter((c) => new Date(c.updatedAt).getTime() >= cutoff)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function localChat(expertId: string, conversationId: string): string {
  const rows = (readLocalTable("chat_messages") as LocalMessage[]).filter(
    (r) => r.expert_id === expertId && (r.conversation_id ?? "default") === conversationId,
  );
  return JSON.stringify(rows.map((r) => r.message));
}

export function localClearChat(expertId: string, conversationId: string): void {
  const rows = (readLocalTable("chat_messages") as LocalMessage[]).filter(
    (r) => !(r.expert_id === expertId && (r.conversation_id ?? "default") === conversationId),
  );
  writeLocalTable("chat_messages", rows);
}

export function localCreateExpert(input: {
  name: string;
  description: string;
  sources: string[];
}): string {
  seedLocalData();
  const id =
    input.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") +
    "-" +
    Math.random().toString(36).slice(2, 5);
  const experts = readLocalTable("experts");
  experts.push({
    id,
    name: input.name,
    description: input.description,
    sources: input.sources,
    created_at: now(),
  });
  writeLocalTable("experts", experts);
  appendLocalRows("activity", [
    {
      id: `evt_${Date.now().toString(36)}`,
      ts: now(),
      actor: "human",
      actor_name: "Propietario local",
      type: "Configuración",
      expert_id: id,
      status: "ok",
      summary: `Creado Experto "${input.name}"`,
      sources: input.sources,
    },
  ]);
  return id;
}

export function localToggleProcess(id: string): void {
  const rows = readLocalTable("processes");
  const next = rows.map((p) => (p["id"] === id ? { ...p, active: !p["active"] } : p));
  writeLocalTable("processes", next);
}

/** Append a generic activity event (used by no-op local mutations). */
export function localLogActivity(entry: Record<string, unknown>): void {
  appendLocalRows("activity", [{ id: `evt_${Date.now().toString(36)}`, ts: now(), ...entry }]);
}
