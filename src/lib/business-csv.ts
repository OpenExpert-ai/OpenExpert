// SPDX-License-Identifier: MIT
// CSV import for the business tables. Pure parsing: no database, no server
// imports, so the rules can be tested without booting sql.js.
//
// The template is deliberately small. Pipedrive and Holded can export more
// columns than these tables hold; the importer keeps the ones it understands
// and says which required ones are missing instead of guessing.

export type BusinessEntity = "deals" | "invoices" | "campaigns" | "accounts";

export type DealInput = {
  id: string;
  company: string;
  stage: string;
  value: number;
  owner: string;
  daysInStage: number;
  closeDate: string | null;
  status: string;
};

export type InvoiceInput = {
  id: string;
  client: string;
  amount: number;
  dueDate: string;
  status: string;
  reminders: number;
};

export type CampaignInput = {
  id: string;
  name: string;
  channel: string;
  status: string;
  spend7d: number;
  conversions7d: number;
  cpaTarget: number;
  dailyBudget: number;
};

export type AccountInput = {
  id: string;
  name: string;
  mrr: number;
  usageTrend: number;
  openTickets: number;
  churnRisk: number;
};

export type ParsedBusinessRow =
  | { entity: "deals"; data: DealInput }
  | { entity: "invoices"; data: InvoiceInput }
  | { entity: "campaigns"; data: CampaignInput }
  | { entity: "accounts"; data: AccountInput };

export type CsvError = { row: number; message: string };

export type CsvParseResult = {
  rows: ParsedBusinessRow[];
  errors: CsvError[];
  headers: string[];
};

/** The columns each entity understands, in the order the template writes them. */
export const BUSINESS_COLUMNS: Record<BusinessEntity, readonly string[]> = {
  deals: ["id", "company", "stage", "value", "owner", "daysInStage", "closeDate", "status"],
  invoices: ["id", "client", "amount", "dueDate", "status", "reminders"],
  campaigns: [
    "id",
    "name",
    "channel",
    "status",
    "spend7d",
    "conversions7d",
    "cpaTarget",
    "dailyBudget",
  ],
  accounts: ["id", "name", "mrr", "usageTrend", "openTickets", "churnRisk"],
};

const ALIASES: Record<string, string> = {
  id: "id",
  identificador: "id",
  company: "company",
  empresa: "company",
  organizacion: "company",
  organization: "company",
  org: "company",
  cliente: "client",
  client: "client",
  stage: "stage",
  etapa: "stage",
  fase: "stage",
  value: "value",
  valor: "value",
  importe: "value",
  amount: "amount",
  owner: "owner",
  propietario: "owner",
  responsable: "owner",
  daysinstage: "daysInStage",
  diasenetapa: "daysInStage",
  diasetapa: "daysInStage",
  diasenlaetapa: "daysInStage",
  closedate: "closeDate",
  fechacierre: "closeDate",
  fechadecierre: "closeDate",
  status: "status",
  estado: "status",
  duedate: "dueDate",
  vencimiento: "dueDate",
  fechavencimiento: "dueDate",
  fechadevencimiento: "dueDate",
  reminders: "reminders",
  recordatorios: "reminders",
  name: "name",
  nombre: "name",
  campana: "name",
  channel: "channel",
  canal: "channel",
  spend7d: "spend7d",
  gasto7d: "spend7d",
  gasto: "spend7d",
  conversions7d: "conversions7d",
  conversiones7d: "conversions7d",
  conversiones: "conversions7d",
  cpatarget: "cpaTarget",
  cpaobjetivo: "cpaTarget",
  dailybudget: "dailyBudget",
  presupuestodiario: "dailyBudget",
  mrr: "mrr",
  usagetrend: "usageTrend",
  tendenciauso: "usageTrend",
  tendenciadeuso: "usageTrend",
  opentickets: "openTickets",
  ticketsabiertos: "openTickets",
  churnrisk: "churnRisk",
  riesgochurn: "churnRisk",
  riesgodechurn: "churnRisk",
};

/** Lowercase, without accents, without punctuation: `Días en etapa` → `diaseneta`. */
function headerKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Split CSV text into rows. Handles quoted fields, escaped quotes and line
 * breaks inside a field; comma, semicolon and tab are all accepted because
 * Excel in Spanish writes semicolons and Pipedrive writes commas.
 */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.slice(0, clean.indexOf("\n") === -1 ? clean.length : clean.indexOf("\n"));
  const candidates = [",", ";", "\t"];
  const delimiter = candidates.sort(
    (a, b) => firstLine.split(b).length - firstLine.split(a).length,
  )[0];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

/** `1.234,56`, `1,234.56`, `1.234` and `1234,56` all read as Spanish-friendly numbers. */
export function parseNumber(value: string, fallback = 0): number {
  const raw = value.trim().replace(/[€$£\s%]/g, "");
  if (!raw) return fallback;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;
  if (lastComma !== -1 && lastDot !== -1) {
    normalized =
      lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastComma !== -1) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (lastDot !== -1) {
    const decimals = raw.length - lastDot - 1;
    const dots = (raw.match(/\./g) ?? []).length;
    normalized = dots > 1 || decimals === 3 ? raw.replace(/\./g, "") : raw;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

/** ISO, `dd/mm/yyyy` and `dd-mm-yyyy`; anything else is left as written. */
export function parseDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return raw;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return raw;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function valueOf(row: string[], columns: Map<string, number>, key: string): string {
  const index = columns.get(key);
  return index === undefined ? "" : (row[index] ?? "").trim();
}

function idFor(entity: BusinessEntity, row: string[], columns: Map<string, number>, index: number) {
  return valueOf(row, columns, "id") || `csv-${entity}-${index}`;
}

/**
 * Turn a CSV into typed rows. A row that cannot be used is reported with its
 * line number and skipped; the rest still imports, because one bad export row
 * should not throw away a whole file.
 */
export function parseBusinessCsv(entity: BusinessEntity, text: string): CsvParseResult {
  const grid = parseCsv(text);
  if (grid.length === 0) return { rows: [], errors: [], headers: [] };
  const headers = grid[0] ?? [];
  const columns = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = ALIASES[headerKey(header)];
    if (key && !columns.has(key)) columns.set(key, index);
  });

  const rows: ParsedBusinessRow[] = [];
  const errors: CsvError[] = [];
  const max = 5000;
  for (let i = 1; i < grid.length; i++) {
    if (rows.length >= max) {
      errors.push({ row: i + 1, message: `Máximo ${max} filas por importación.` });
      break;
    }
    const row = grid[i] ?? [];
    const line = i + 1;
    try {
      if (entity === "deals") {
        const company = valueOf(row, columns, "company");
        if (!company) throw new Error("Falta company (empresa).");
        const closeDate = parseDate(valueOf(row, columns, "closeDate"));
        rows.push({
          entity,
          data: {
            id: idFor(entity, row, columns, i),
            company,
            stage: valueOf(row, columns, "stage") || "Sin etapa",
            value: parseNumber(valueOf(row, columns, "value")),
            owner: valueOf(row, columns, "owner"),
            daysInStage: Math.max(0, Math.round(parseNumber(valueOf(row, columns, "daysInStage")))),
            closeDate: closeDate || null,
            status: valueOf(row, columns, "status") || "open",
          },
        });
      } else if (entity === "invoices") {
        const client = valueOf(row, columns, "client");
        if (!client) throw new Error("Falta client (cliente).");
        const dueDate = parseDate(valueOf(row, columns, "dueDate"));
        if (!dueDate) throw new Error("Falta dueDate (vencimiento).");
        rows.push({
          entity,
          data: {
            id: idFor(entity, row, columns, i),
            client,
            amount: parseNumber(valueOf(row, columns, "amount")),
            dueDate,
            status: valueOf(row, columns, "status") || "open",
            reminders: Math.max(0, Math.round(parseNumber(valueOf(row, columns, "reminders")))),
          },
        });
      } else if (entity === "campaigns") {
        const name = valueOf(row, columns, "name");
        if (!name) throw new Error("Falta name (nombre).");
        rows.push({
          entity,
          data: {
            id: idFor(entity, row, columns, i),
            name,
            channel: valueOf(row, columns, "channel"),
            status: valueOf(row, columns, "status") || "active",
            spend7d: parseNumber(valueOf(row, columns, "spend7d")),
            conversions7d: Math.max(
              0,
              Math.round(parseNumber(valueOf(row, columns, "conversions7d"))),
            ),
            cpaTarget: parseNumber(valueOf(row, columns, "cpaTarget")),
            dailyBudget: parseNumber(valueOf(row, columns, "dailyBudget")),
          },
        });
      } else {
        const name = valueOf(row, columns, "name");
        if (!name) throw new Error("Falta name (nombre).");
        rows.push({
          entity,
          data: {
            id: idFor(entity, row, columns, i),
            name,
            mrr: parseNumber(valueOf(row, columns, "mrr")),
            usageTrend: parseNumber(valueOf(row, columns, "usageTrend")),
            openTickets: Math.max(0, Math.round(parseNumber(valueOf(row, columns, "openTickets")))),
            churnRisk: parseNumber(valueOf(row, columns, "churnRisk")),
          },
        });
      }
    } catch (e) {
      errors.push({ row: line, message: (e as Error).message });
    }
  }
  return { rows, errors, headers };
}

/** The header line a spreadsheet needs to produce an import this parser accepts. */
export function templateFor(entity: BusinessEntity): string {
  return `${BUSINESS_COLUMNS[entity].join(",")}\n`;
}
