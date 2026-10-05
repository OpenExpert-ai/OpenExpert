// SPDX-License-Identifier: MIT
// Local SQLite database (sql.js). Single file in OPENEXPERT_DATA_DIR.
// The schema is applied idempotently from drizzle/init.sql and example data
// is seeded on first run.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Database } from "sql.js";
import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import schemaSql from "../../drizzle/init.sql?raw";
import * as schema from "../../drizzle/schema";
import { applyFileConfigToEnv } from "./config.server";
import { dataDir, dbPath, expandHome } from "./paths.server";

// Incremental migrations applied after the baseline DDL. Add a numbered
// `drizzle/migrations/NNNN_description.sql` for every schema change so
// existing databases are upgraded at startup.
const migrations = import.meta.glob("../../drizzle/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export { expandHome, dataDir, dbPath };

const require = createRequire(import.meta.url);
// Load sql.js at runtime (CommonJS) instead of letting the bundler inline it:
// its Node build relies on __dirname, which does not exist in an ESM bundle.
const initSqlJs = require("sql.js") as typeof import("sql.js").default;

export type Db = SQLJsDatabase<typeof schema>;

type Handle = { orm: Db; raw: Database; file: string };

let handle: Promise<Handle> | null = null;

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
// openexpert.json first (so it can set OPENEXPERT_DATA_DIR), then the secrets.
applyFileConfigToEnv();
loadSecretsIntoEnv();

/** Write the in-memory database to disk atomically (tmp + rename). */
function writeDbFile(file: string, raw: Database): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, Buffer.from(raw.export()));
  renameSync(tmp, file);
}

/**
 * Apply `drizzle/migrations/*.sql` in order, tracked by `PRAGMA user_version`.
 * The baseline DDL (`init.sql`) is idempotent, so a fresh database and an
 * existing one converge.
 */
function applyMigrations(raw: Database): void {
  const current = Number(raw.exec("PRAGMA user_version")[0]?.values[0]?.[0] ?? 0);
  const pending = Object.entries(migrations)
    .map(([path, sql]) => {
      const match = /(?:^|\/)(\d+)_/.exec(path);
      return { version: match ? Number(match[1]) : 0, sql };
    })
    .filter((m) => m.version > 0)
    .sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    if (migration.version <= current) continue;
    raw.exec(migration.sql);
    raw.exec(`PRAGMA user_version = ${migration.version}`);
  }
}

async function init(): Promise<Handle> {
  const SQL = await initSqlJs({
    locateFile: (f) => require.resolve(`sql.js/dist/${f}`),
  });
  const file = dbPath();
  mkdirSync(dirname(file), { recursive: true });
  const raw = existsSync(file) ? new SQL.Database(readFileSync(file)) : new SQL.Database();
  raw.exec(schemaSql);
  applyMigrations(raw);
  const orm = drizzle(raw, { schema });
  seedIfEmpty(orm);
  writeDbFile(file, raw);
  return { orm, raw, file };
}

export function getDb(): Promise<Handle> {
  if (!handle) handle = init();
  return handle;
}

/** Forget the in-memory database so the next read reloads it from disk. */
export function resetDbHandle(): void {
  handle = null;
}

/** Persist the in-memory database to disk. Call after any write. */
export async function persist(): Promise<void> {
  const { raw, file } = await getDb();
  writeDbFile(file, raw);
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

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

// Example business data so the assistant has real figures to reason about on a
// fresh install. Stages match the probabilities used by `pipelineSummary`.
const DEFAULT_DEALS = [
  {
    id: "d-acme",
    company: "Acme Corp",
    stage: "Negociación",
    value: 48000,
    owner: "Lucía",
    daysInStage: 8,
    status: "open",
  },
  {
    id: "d-stark",
    company: "Stark Industries",
    stage: "Propuesta",
    value: 61000,
    owner: "Marc",
    daysInStage: 12,
    status: "open",
  },
  {
    id: "d-globex",
    company: "Globex",
    stage: "Propuesta",
    value: 26500,
    owner: "Marc",
    daysInStage: 26,
    status: "open",
  },
  {
    id: "d-initech",
    company: "Initech",
    stage: "Demo",
    value: 12000,
    owner: "Lucía",
    daysInStage: 4,
    status: "open",
  },
  {
    id: "d-umbrella",
    company: "Umbrella",
    stage: "Cualificación",
    value: 9000,
    owner: "Sara",
    daysInStage: 31,
    status: "open",
  },
  {
    id: "d-hoc",
    company: "Hooli",
    stage: "Demo",
    value: 18000,
    owner: "Sara",
    daysInStage: 2,
    status: "open",
  },
  {
    id: "d-won-1",
    company: "Wayne Enterprises",
    stage: "Negociación",
    value: 15000,
    owner: "Sara",
    daysInStage: 0,
    status: "won",
  },
  {
    id: "d-won-2",
    company: "Soylent",
    stage: "Propuesta",
    value: 8000,
    owner: "Lucía",
    daysInStage: 0,
    status: "won",
  },
  {
    id: "d-lost",
    company: "Cyberdyne",
    stage: "Cualificación",
    value: 5000,
    owner: "Marc",
    daysInStage: 0,
    status: "lost",
  },
];

const DEFAULT_INVOICES = [
  {
    id: "inv-acme",
    client: "Acme Corp",
    amount: 12500,
    dueDate: daysAgo(25),
    status: "overdue",
    reminders: 1,
  },
  {
    id: "inv-globex",
    client: "Globex",
    amount: 4300,
    dueDate: daysAgo(12),
    status: "overdue",
    reminders: 0,
  },
  {
    id: "inv-initech",
    client: "Initech",
    amount: 890,
    dueDate: daysAgo(40),
    status: "overdue",
    reminders: 2,
  },
  {
    id: "inv-umbrella",
    client: "Umbrella",
    amount: 2100,
    dueDate: daysAgo(-10),
    status: "open",
    reminders: 0,
  },
  {
    id: "inv-hoc",
    client: "Hooli",
    amount: 5000,
    dueDate: daysAgo(60),
    status: "paid",
    reminders: 1,
  },
];

const DEFAULT_CAMPAIGNS = [
  {
    id: "c-meta",
    name: "Prospección Meta",
    channel: "Meta Ads",
    status: "active",
    spend7d: 5200,
    conversions7d: 60,
    cpaTarget: 60,
    dailyBudget: 800,
  },
  {
    id: "c-google",
    name: "Search marca",
    channel: "Google Ads",
    status: "active",
    spend7d: 3500,
    conversions7d: 70,
    cpaTarget: 40,
    dailyBudget: 500,
  },
  {
    id: "c-linkedin",
    name: "ABM enterprise",
    channel: "LinkedIn",
    status: "active",
    spend7d: 1800,
    conversions7d: 36,
    cpaTarget: 55,
    dailyBudget: 300,
  },
  {
    id: "c-email",
    name: "Newsletter",
    channel: "Email",
    status: "active",
    spend7d: 300,
    conversions7d: 25,
    cpaTarget: 15,
    dailyBudget: 50,
  },
  {
    id: "c-tiktok",
    name: "Test TikTok",
    channel: "TikTok",
    status: "paused",
    spend7d: 900,
    conversions7d: 10,
    cpaTarget: 70,
    dailyBudget: 120,
  },
];

const DEFAULT_ACCOUNTS = [
  {
    id: "a-acme",
    name: "Acme Corp",
    mrr: 4200,
    usageTrend: -0.18,
    openTickets: 3,
    churnRisk: 0.82,
  },
  {
    id: "a-umbrella",
    name: "Umbrella",
    mrr: 3100,
    usageTrend: -0.12,
    openTickets: 2,
    churnRisk: 0.63,
  },
  { id: "a-globex", name: "Globex", mrr: 2600, usageTrend: -0.05, openTickets: 1, churnRisk: 0.41 },
  {
    id: "a-initech",
    name: "Initech",
    mrr: 1500,
    usageTrend: 0.09,
    openTickets: 0,
    churnRisk: 0.12,
  },
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
  const hasDeals = orm.select().from(schema.deals).limit(1).all().length > 0;
  if (!hasDeals) {
    orm
      .insert(schema.deals)
      .values(DEFAULT_DEALS.map((d) => ({ ...d, closeDate: null })))
      .run();
  }
  const hasInvoices = orm.select().from(schema.invoices).limit(1).all().length > 0;
  if (!hasInvoices) orm.insert(schema.invoices).values(DEFAULT_INVOICES).run();
  const hasCampaigns = orm.select().from(schema.campaigns).limit(1).all().length > 0;
  if (!hasCampaigns) orm.insert(schema.campaigns).values(DEFAULT_CAMPAIGNS).run();
  const hasAccounts = orm.select().from(schema.accounts).limit(1).all().length > 0;
  if (!hasAccounts) orm.insert(schema.accounts).values(DEFAULT_ACCOUNTS).run();
}
