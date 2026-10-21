// SPDX-License-Identifier: MIT
// Shared Office document text extraction, used by local folders AND Google
// Drive so both understand the same formats. Server-only.
//
// Lightweight on purpose: `mammoth` for .docx, `exceljs` for .xlsx and a small
// `fflate`-based reader for .pptx and OpenDocument. The previous `officeparser`
// pulled pdfjs and tesseract.js (OCR) that this app never uses.
//
// Spreadsheets become CSV (one block per sheet); documents and slides become
// plain text. PDF stays on `unpdf`, which is already wired for it.

import { createRequire } from "node:module";

// mammoth and exceljs ship browser builds; load their CommonJS/node entry so
// Vite never picks the browser one (same pattern as sql.js in db.server.ts).
const nodeRequire = createRequire(import.meta.url);

export const OFFICE_EXT = new Set([".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp"]);

/**
 * Shape of a spreadsheet, so a caller can describe a table to the model instead
 * of handing it a wall of text. `columns` comes from the first non-empty row,
 * which is what a CSV export calls the header.
 */
export type SheetInfo = { name: string; rows: number; columns: string[] };

const FILE_TYPE: Record<string, "docx" | "xlsx" | "pptx" | "odt" | "ods" | "odp"> = {
  ".docx": "docx",
  ".xlsx": "xlsx",
  ".pptx": "pptx",
  ".odt": "odt",
  ".ods": "ods",
  ".odp": "odp",
};

/** Google Drive mime types that map to an Office extension. */
export const OFFICE_MIME: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.oasis.opendocument.text": ".odt",
  "application/vnd.oasis.opendocument.spreadsheet": ".ods",
  "application/vnd.oasis.opendocument.presentation": ".odp",
};

export type OfficeText = {
  text: string | null;
  note?: string;
  /**
   * For spreadsheets: what the table actually is (sheets, data rows, header). Without this the
   * model receives a wall of comma-separated text and has to guess where the rows end, which is
   * how you get a plausible wrong total instead of an error.
   */
  sheets?: SheetInfo[];
};

export async function extractOfficeText(buf: Uint8Array, ext: string): Promise<OfficeText> {
  const fileType = FILE_TYPE[ext.toLowerCase()];
  if (!fileType) return { text: null, note: "Formato Office no soportado." };
  try {
    let text: string;
    let sheets: SheetInfo[] | undefined;
    let skipped = 0;
    if (fileType === "docx") text = await docxText(buf);
    else if (fileType === "xlsx") ({ text, sheets } = await xlsxText(buf));
    else if (fileType === "pptx") ({ text, skipped } = pptxText(buf));
    else ({ text, skipped } = odfText(buf));
    // A document that needed more than the cap is not "a document without text": saying so would
    // hide a bomb behind the same note as an empty file. The caller gets the reason instead.
    if (skipped > 0) return { text: null, note: OFFICE_TOO_BIG_NOTE };
    const trimmed = text.trim();
    if (!trimmed) return { text: null, note: "El documento no contiene texto extraíble." };
    return { text: trimmed, ...(sheets?.length ? { sheets } : {}) };
  } catch (e) {
    return { text: null, note: `No se pudo leer el documento (${(e as Error).message}).` };
  }
}

async function docxText(buf: Uint8Array): Promise<string> {
  const mammoth = nodeRequire("mammoth") as typeof import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  return value;
}

/* ------------------------------ spreadsheets ---------------------------- */

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o["richText"]))
      return (o["richText"] as { text?: string }[]).map((r) => r.text ?? "").join("");
    if (typeof o["text"] === "string") return o["text"];
    if (o["result"] !== undefined) return cellText(o["result"]);
    if (o["error"] !== undefined) return String(o["error"]);
  }
  return String(v);
}

async function xlsxText(buf: Uint8Array): Promise<{ text: string; sheets: SheetInfo[] }> {
  const ExcelJS = nodeRequire("exceljs") as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  // exceljs bundles an older Buffer type; cast to its exact parameter type.
  await wb.xlsx.load(Buffer.from(buf) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const lines: string[] = [];
  const sheets: SheetInfo[] = [];
  wb.eachSheet((ws) => {
    const sheetLines: string[] = [`# ${ws.name}`];
    let header: string[] | null = null;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(csvCell(cellText(cell.value))));
      if (!header) header = cells;
      sheetLines.push(cells.join(","));
    });
    lines.push(...sheetLines);
    // The header row is not a data row. Counting it as one would inflate every table by one,
    // and the model would report a row count that does not match what the user sees in Excel.
    sheets.push({
      name: ws.name,
      rows: Math.max(0, sheetLines.length - 1),
      columns: header ?? [],
    });
  });
  return { text: lines.join("\n"), sheets };
}

/* --------------------------- zip-based (pptx/odf) ----------------------- */

function collect(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1] ?? "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Plain text of an XML fragment: markup (inline `<text:span>`, `<text:a>`…) and
 * any partial tag left behind by malformed or truncated markup are dropped, so
 * no fragment of a tag reaches the caller.
 *
 * A character scan rather than a `/<[^>]*>/g` replace on purpose: this is a text
 * extractor, not an HTML sanitiser, and a regex replace of tags is exactly the
 * shape that scanners report as incomplete sanitisation. Entities are decoded
 * **after** the scan, so a legitimate `&lt;` in the document survives as text.
 */
function plainText(fragment: string): string {
  // A `<` only opens a tag when something closes it; every `<` past the last
  // `>` in the fragment is a stray character and is dropped as such.
  const lastClose = fragment.lastIndexOf(">");
  let text = "";
  let i = 0;
  while (i < fragment.length) {
    if (fragment[i] === "<") {
      i = i < lastClose ? fragment.indexOf(">", i + 1) + 1 : i + 1;
      continue;
    }
    text += fragment[i];
    i += 1;
  }
  return decodeEntities(text);
}

/** `ppt/slides/slide12.xml` → 12; null for anything else in the archive. */
function slideNumber(name: string): number | null {
  const match = /^ppt\/slides\/slide(\d+)\.xml$/.exec(name);
  return match ? Number(match[1]) : null;
}

/**
 * Bytes a `.pptx` or OpenDocument may inflate to before it is refused.
 *
 * The size on disk says nothing about the size in memory: deflate over repeated data amplifies
 * 1000x or more, so a 256 KiB `.odt` —a 256 MB `content.xml` of zeros, compressed— asked for a
 * 256 MB allocation and grew the process RSS by 549 MB (measured). The cap is checked against the
 * `originalSize` the central directory declares and applied **before** inflating, so such an entry
 * is dropped without reserving memory. 64 MB leave room for any real document and cut the bad case.
 *
 * It covers the ZIPs we read ourselves (`.pptx` and OpenDocument). `.docx` and `.xlsx` are unzipped
 * whole inside their library (mammoth, exceljs), which takes no filter, so they are outside this
 * gate; capping them means replacing the reader.
 */
export const MAX_OFFICE_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;

/** Note for a document that asked for more than the cap allows. */
const OFFICE_TOO_BIG_NOTE = `El documento se descomprimiría por encima de los ${Math.round(
  MAX_OFFICE_UNCOMPRESSED_BYTES / 1024 / 1024,
)} MB que se aceptan; no se lee para no agotar la memoria del proceso.`;

/** Text read from a ZIP, plus how many relevant entries were left uninflated for size. */
type ZipText = { text: string; skipped: number };

/** Entries inflated from a ZIP and how many were dropped for going over the cap. */
type ZipEntries = { files: Record<string, Uint8Array>; skipped: number };

/**
 * Inflates only the entries `wanted` accepts and never more than `MAX_OFFICE_UNCOMPRESSED_BYTES`.
 *
 * `fflate` calls the filter with the declared uncompressed size and, when it returns `false`, does
 * not even inflate the entry. Without a filter `unzipSync` unzips the whole archive —images and the
 * deck's media included— into memory before anyone looks at what is used.
 */
function zipEntries(buf: Uint8Array, wanted: (name: string) => boolean): ZipEntries {
  const { unzipSync } = nodeRequire("fflate") as typeof import("fflate");
  let budget = MAX_OFFICE_UNCOMPRESSED_BYTES;
  let skipped = 0;
  const files = unzipSync(buf, {
    filter: (file) => {
      if (!wanted(file.name)) return false;
      if (file.originalSize > budget) {
        skipped += 1;
        return false;
      }
      budget -= file.originalSize;
      return true;
    },
  });
  return { files, skipped };
}

function pptxText(buf: Uint8Array): ZipText {
  const { strFromU8 } = nodeRequire("fflate") as typeof import("fflate");
  // Only the slides are inflated: the deck's images and media are never read, and they are most of
  // the weight of a real .pptx.
  const { files, skipped } = zipEntries(buf, (name) => slideNumber(name) !== null);
  // Sort by the slide number, not by the entry name: as strings `slide10.xml`
  // lands between `slide1.xml` and `slide2.xml`, and in a deck the order is the
  // content, so the model would read slide 2 after slide 12 without any error.
  const slides = Object.keys(files)
    .map((name) => ({ name, number: slideNumber(name) }))
    .filter((s): s is { name: string; number: number } => s.number !== null)
    .sort((a, b) => a.number - b.number);
  const text = slides
    .map(({ name }) => collect(strFromU8(files[name]!), "a:t").map(decodeEntities).join(" "))
    .join("\n");
  return { text, skipped };
}

function odfText(buf: Uint8Array): ZipText {
  const { strFromU8 } = nodeRequire("fflate") as typeof import("fflate");
  // `content.xml` is the only entry read from an OpenDocument: `styles.xml` and the embedded
  // objects add weight and no text.
  const { files, skipped } = zipEntries(buf, (name) => name === "content.xml");
  const content = files["content.xml"];
  if (!content) return { text: "", skipped };
  const xml = strFromU8(content);
  const text = collect(xml, "text:p").concat(collect(xml, "text:h")).map(plainText).join("\n");
  return { text, skipped };
}
