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

export type OfficeText = { text: string | null; note?: string };

export async function extractOfficeText(buf: Uint8Array, ext: string): Promise<OfficeText> {
  const fileType = FILE_TYPE[ext.toLowerCase()];
  if (!fileType) return { text: null, note: "Formato Office no soportado." };
  try {
    let text: string;
    if (fileType === "docx") text = await docxText(buf);
    else if (fileType === "xlsx") text = await xlsxText(buf);
    else if (fileType === "pptx") text = pptxText(buf);
    else text = odfText(buf);
    const trimmed = text.trim();
    if (!trimmed) return { text: null, note: "El documento no contiene texto extraíble." };
    return { text: trimmed };
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

async function xlsxText(buf: Uint8Array): Promise<string> {
  const ExcelJS = nodeRequire("exceljs") as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  // exceljs bundles an older Buffer type; cast to its exact parameter type.
  await wb.xlsx.load(Buffer.from(buf) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const lines: string[] = [];
  wb.eachSheet((ws) => {
    lines.push(`# ${ws.name}`);
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(csvCell(cellText(cell.value))));
      lines.push(cells.join(","));
    });
  });
  return lines.join("\n");
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

function pptxText(buf: Uint8Array): string {
  const { unzipSync, strFromU8 } = nodeRequire("fflate") as typeof import("fflate");
  const files = unzipSync(buf);
  const slides = Object.keys(files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort();
  return slides
    .map((k) => collect(strFromU8(files[k]!), "a:t").map(decodeEntities).join(" "))
    .join("\n");
}

function odfText(buf: Uint8Array): string {
  const { unzipSync, strFromU8 } = nodeRequire("fflate") as typeof import("fflate");
  const files = unzipSync(buf);
  const content = files["content.xml"];
  if (!content) return "";
  const xml = strFromU8(content);
  return collect(xml, "text:p")
    .concat(collect(xml, "text:h"))
    .map((p) => decodeEntities(p.replace(/<[^>]+>/g, "")))
    .join("\n");
}
