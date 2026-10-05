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
    domains: ["ventas", "finanzas", "marketing", "clientes"],
  },
  {
    id: "ventas",
    name: "Ventas",
    description: "CRM, pipeline, leads y previsión comercial.",
    sources: [],
    domains: ["ventas"],
  },
  {
    id: "finanzas",
    name: "Finanzas",
    description: "Facturación, conciliación y tesorería.",
    sources: ["gdrive"],
    domains: ["finanzas"],
  },
  {
    id: "marketing",
    name: "Marketing",
    description: "Campañas, inversión y atribución.",
    sources: ["gdrive"],
    domains: ["marketing"],
  },
];

const DEFAULT_INTEGRATIONS = [
  { id: "gdrive", name: "Google Drive", category: "Productividad" },
  { id: "local", name: "Archivos locales", category: "Productividad" },
  { id: "notion", name: "Notion", category: "Productividad" },
  { id: "pipedrive", name: "Pipedrive", category: "CRM" },
  { id: "salesforce", name: "Salesforce", category: "CRM" },
  { id: "holded", name: "Holded", category: "ERP / Finanzas" },
  { id: "gmail", name: "Gmail", category: "Productividad" },
  { id: "slack", name: "Slack", category: "Productividad" },
  { id: "ga", name: "Google Analytics", category: "Publicidad" },
  { id: "meta", name: "Meta Ads", category: "Publicidad" },
];

// Business data (deals, invoices, campaigns, accounts) is NOT seeded:
// OpenExpert ships empty and only shows real figures once a connector or an
// import provides them. Keeping example rows here made the assistant look
// like it was reading Pipedrive/Holded when it was reading local fixtures.

function seedIfEmpty(orm: Db): void {
  const hasExperts = orm.select().from(schema.experts).limit(1).all().length > 0;
  if (!hasExperts) {
    orm
      .insert(schema.experts)
      .values(DEFAULT_EXPERTS.map((e) => ({ ...e, createdAt: now() })))
      .run();
  }
  const existingIntegrationIds = new Set(
    orm
      .select()
      .from(schema.integrations)
      .all()
      .map((i) => i.id),
  );
  const missingIntegrations = DEFAULT_INTEGRATIONS.filter((i) => !existingIntegrationIds.has(i.id));
  if (missingIntegrations.length) {
    orm
      .insert(schema.integrations)
      .values(missingIntegrations.map((i) => ({ ...i, connected: false, entities: [] })))
      .run();
  }
  // No business data is seeded (see the note above).
}
