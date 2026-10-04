// SPDX-License-Identifier: MIT
// Local SQLite database (sql.js). Single file in OPENEXPERT_DATA_DIR.
// The schema is applied idempotently from drizzle/init.sql and example data
// is seeded on first run.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Database } from "sql.js";
import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import schemaSql from "../../drizzle/init.sql?raw";
import * as schema from "../../drizzle/schema";

const require = createRequire(import.meta.url);
// Load sql.js at runtime (CommonJS) instead of letting the bundler inline it:
// its Node build relies on __dirname, which does not exist in an ESM bundle.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs = require("sql.js") as typeof import("sql.js").default;

export type Db = SQLJsDatabase<typeof schema>;

type Handle = { orm: Db; raw: Database; file: string };

let handle: Promise<Handle> | null = null;

export function expandHome(p: string): string {
  if (p === "~") return process.env["HOME"] || process.env["USERPROFILE"] || ".";
  if (p.startsWith("~/"))
    return join(process.env["HOME"] || process.env["USERPROFILE"] || ".", p.slice(2));
  return p;
}

export function dataDir(): string {
  const raw = process.env["OPENEXPERT_DATA_DIR"] || "~/.openexpert";
  return expandHome(raw);
}

export function dbPath(): string {
  return join(dataDir(), "openexpert.db");
}

export const now = () => new Date().toISOString();

/**
 * Load the secrets written by the CLI wizard (`~/.openexpert/secrets.json`)
 * into the environment at startup, so `npm run dev` behaves like
 * `opencore serve`. Existing env vars always win.
 */
function loadSecretsIntoEnv(): void {
  try {
    const f = join(dataDir(), "secrets.json");
    if (!existsSync(f)) return;
    const secrets = JSON.parse(readFileSync(f, "utf8")) as Record<string, string>;
    for (const [key, value] of Object.entries(secrets)) {
      if (value && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // A malformed secrets file must never stop the server from booting.
  }
}
loadSecretsIntoEnv();

async function init(): Promise<Handle> {
  const SQL = await initSqlJs({
    locateFile: (f) => require.resolve(`sql.js/dist/${f}`),
  });
  const file = dbPath();
  mkdirSync(dirname(file), { recursive: true });
  const raw = existsSync(file) ? new SQL.Database(readFileSync(file)) : new SQL.Database();
  raw.exec(schemaSql);
  const orm = drizzle(raw, { schema });
  seedIfEmpty(orm);
  writeFileSync(file, Buffer.from(raw.export()));
  return { orm, raw, file };
}

export function getDb(): Promise<Handle> {
  if (!handle) handle = init();
  return handle;
}

/** Persist the in-memory database to disk. Call after any write. */
export async function persist(): Promise<void> {
  const { raw, file } = await getDb();
  writeFileSync(file, Buffer.from(raw.export()));
}

/* --------------------------- Seed data --------------------------- */

const DEFAULT_EXPERTS = [
  {
    id: "general",
    name: "General",
    description: "Dirección: indicadores consolidados y OKR. Consulta datos de todos los dominios.",
    sources: ["gdrive"],
  },
  {
    id: "ventas",
    name: "Ventas",
    description: "CRM, pipeline, leads y previsión comercial.",
    sources: [],
  },
  {
    id: "finanzas",
    name: "Finanzas",
    description: "Facturación, conciliación y tesorería.",
    sources: ["gdrive"],
  },
  {
    id: "marketing",
    name: "Marketing",
    description: "Campañas, inversión y atribución.",
    sources: ["gdrive"],
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
    expertId: "finanzas",
  },
  {
    id: "p-campaign-efficiency",
    name: "Eficiencia de campañas",
    description: "Señala campañas que superan su CPA objetivo y propone pausarlas.",
    trigger: "Umbral · CPA > objetivo +30 %",
    stages: ["Medir CPA", "Comparar objetivo", "Proponer pausa"],
    limits: ["Requiere aprobación humana"],
    approval: "Requerida",
    expertId: "marketing",
  },
  {
    id: "p-pipeline-health",
    name: "Salud del pipeline",
    description: "Resumen semanal del pipeline y oportunidades estancadas.",
    trigger: "Cron · viernes 17:00",
    stages: ["Leer pipeline", "Detectar estancadas", "Resumir"],
    limits: [],
    approval: "Ninguna",
    expertId: "ventas",
  },
];

const DEFAULT_INTEGRATIONS = [
  { id: "gdrive", name: "Google Drive", category: "Productividad" },
  { id: "pipedrive", name: "Pipedrive", category: "CRM" },
  { id: "salesforce", name: "Salesforce", category: "CRM" },
  { id: "holded", name: "Holded", category: "ERP / Finanzas" },
  { id: "gmail", name: "Gmail", category: "Productividad" },
  { id: "slack", name: "Slack", category: "Productividad" },
  { id: "ga", name: "Google Analytics", category: "Publicidad" },
  { id: "meta", name: "Meta Ads", category: "Publicidad" },
];

function seedIfEmpty(orm: Db): void {
  const hasExperts = orm.select().from(schema.experts).limit(1).all().length > 0;
  if (!hasExperts) {
    orm
      .insert(schema.experts)
      .values(DEFAULT_EXPERTS.map((e) => ({ ...e, createdAt: now() })))
      .run();
  }
  const hasProcesses = orm.select().from(schema.processes).limit(1).all().length > 0;
  if (!hasProcesses) {
    orm
      .insert(schema.processes)
      .values(
        DEFAULT_PROCESSES.map((p) => ({
          ...p,
          active: true,
          runs: 0,
          lastRun: null,
        })),
      )
      .run();
  }
  const hasIntegrations = orm.select().from(schema.integrations).limit(1).all().length > 0;
  if (!hasIntegrations) {
    orm
      .insert(schema.integrations)
      .values(DEFAULT_INTEGRATIONS.map((i) => ({ ...i, connected: false, entities: [] })))
      .run();
  }
}
