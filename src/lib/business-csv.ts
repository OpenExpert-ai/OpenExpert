// SPDX-License-Identifier: MIT
// CSV import for the business tables. Pure parsing: no database, no server
// imports, so the rules can be tested without booting sql.js.
//
// The template is deliberately small. Pipedrive and Holded can export more
// columns than these tables hold; the importer keeps the ones it understands
// and says which required ones are missing instead of guessing.

import { calendarDay } from "./calendar-day";
import { detectDelimiter } from "./csv-text";

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

/**
 * Las filas que una importación acepta como mucho. Vive aquí, junto al corte,
 * porque el panel también la necesita para decir el tope en el aviso.
 */
export const CSV_MAX_ROWS = 5000;

export type CsvParseResult = {
  rows: ParsedBusinessRow[];
  errors: CsvError[];
  headers: string[];
  /**
   * Filas que el tope dejó sin leer. No son filas con error —no se intentaron—
   * y se cuentan aparte para que el usuario no lea «una fila con error» cuando
   * le falta un bloque entero de su exportación.
   */
  omitted: number;
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

/**
 * Headers that name a different column depending on the entity: `importe` is the
 * amount of an invoice, but the value of a deal. Without this a Spanish invoice
 * CSV never fills `amount` and every invoice imports as 0 €.
 */
const ENTITY_ALIASES: Partial<Record<BusinessEntity, Record<string, string>>> = {
  invoices: { importe: "amount", valor: "amount", value: "amount" },
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
 *
 * The separator comes from `detectDelimiter`, the same rule the local file
 * reader uses: counting the candidates in the first line picked a comma inside
 * a quoted header cell over the real separator of the row, and a `;` file whose
 * header held as many commas as the table has separators was then split wrong
 * and every row rejected for missing a column it did have. Now both paths read
 * the same text the same way.
 */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(clean) ?? ",";

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

/**
 * `1.234,56`, `1,234.56`, `1.234` and `1234,56` all read as Spanish-friendly numbers.
 *
 * A single dot with exactly three digits is a thousands separator (`1.234`), except when the
 * integer part is zero: nobody writes `0.500` for five hundred, so there the dot is the decimal
 * mark and the value is 0,5. Otherwise an English-format file with three decimals multiplied the
 * amount by a thousand —`0.500` entered as 500 €— while the same value with a comma (`0,500`)
 * read as 0,5.
 */
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
    const integer = raw.slice(0, lastDot).replace(/^[+-]/, "");
    const zeroInteger = integer === "" || /^0+$/.test(integer);
    normalized = dots > 1 || (decimals === 3 && !zeroInteger) ? raw.replace(/\./g, "") : raw;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Money column: an empty cell means zero, but a cell that is not a number is
 * `null` so the row is rejected. Importing it as 0 € would show a debt the file
 * never said, and nothing would tell the user.
 */
export function parseMoney(value: string): number | null {
  if (!value.trim()) return 0;
  const n = parseNumber(value, Number.NaN);
  return Number.isFinite(n) ? n : null;
}

/** `parseMoney` for a CSV column: throws with the column name and the raw text. */
function moneyOf(row: string[], columns: Map<string, number>, key: string, label: string): number {
  const raw = valueOf(row, columns, key);
  const value = parseMoney(raw);
  if (value === null) throw new Error(`El campo ${key} (${label}) no es un número: «${raw}».`);
  return value;
}

/**
 * ISO, `dd/mm/yyyy` and `dd-mm-yyyy`; anything else is null.
 *
 * The day has to exist in its month. `31/02/2026` in either format is the same
 * impossible day, and storing the text would leave a date the rest of the app
 * cannot read: `calendarDay` rejects it, `daysSince` turns that into 0 and the
 * invoice shows as «0 días» overdue for ever with no import warning. The check
 * is the calendar round trip of `calendarDay`, not a day range of 1 to 31.
 */
export function parseDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return calendarDay(raw) ? raw : null;
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const normalised = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return calendarDay(normalised) ? normalised : null;
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
  if (grid.length === 0) return { rows: [], errors: [], headers: [], omitted: 0 };
  const headers = grid[0] ?? [];
  const columns = new Map<string, number>();
  headers.forEach((header, index) => {
    const name = headerKey(header);
    const key = ENTITY_ALIASES[entity]?.[name] ?? ALIASES[name];
    if (key && !columns.has(key)) columns.set(key, index);
  });

  const rows: ParsedBusinessRow[] = [];
  const errors: CsvError[] = [];
  const max = CSV_MAX_ROWS;
  let omitted = 0;
  for (let i = 1; i < grid.length; i++) {
    if (rows.length >= max) {
      // El resto del fichero no se lee: se cuenta, no se informa como fila rota.
      omitted = grid.length - i;
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
            value: moneyOf(row, columns, "value", "valor"),
            owner: valueOf(row, columns, "owner"),
            daysInStage: Math.max(0, Math.round(parseNumber(valueOf(row, columns, "daysInStage")))),
            closeDate: closeDate || null,
            status: valueOf(row, columns, "status") || "open",
          },
        });
      } else if (entity === "invoices") {
        const client = valueOf(row, columns, "client");
        if (!client) throw new Error("Falta client (cliente).");
        const rawDueDate = valueOf(row, columns, "dueDate");
        const dueDate = parseDate(rawDueDate);
        if (!dueDate) {
          throw new Error(
            rawDueDate
              ? `El campo dueDate (vencimiento) no es una fecha válida: «${rawDueDate}».`
              : "Falta dueDate (vencimiento).",
          );
        }
        rows.push({
          entity,
          data: {
            id: idFor(entity, row, columns, i),
            client,
            amount: moneyOf(row, columns, "amount", "importe"),
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
            spend7d: moneyOf(row, columns, "spend7d", "inversión de 7 días"),
            conversions7d: Math.max(
              0,
              Math.round(parseNumber(valueOf(row, columns, "conversions7d"))),
            ),
            cpaTarget: moneyOf(row, columns, "cpaTarget", "CPA objetivo"),
            dailyBudget: moneyOf(row, columns, "dailyBudget", "presupuesto diario"),
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
            mrr: moneyOf(row, columns, "mrr", "MRR"),
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
  return { rows, errors, headers, omitted };
}

/** The header line a spreadsheet needs to produce an import this parser accepts. */
export function templateFor(entity: BusinessEntity): string {
  return `${BUSINESS_COLUMNS[entity].join(",")}\n`;
}
