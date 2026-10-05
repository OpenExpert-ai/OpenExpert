// SPDX-License-Identifier: MIT
// Shared Office document text extraction, used by local folders AND Google
// Drive so both understand the same formats. Server-only; `officeparser` is
// loaded lazily (and through CommonJS, see below) so it never reaches the
// client bundle and is only paid for when an Office file is actually read.
//
// Spreadsheets become CSV (one block per sheet); documents and slides become
// plain text. PDF stays on `unpdf`, which is already wired for it.

import { createRequire } from "node:module";

// officeparser's ESM entry is broken under Node/Nitro ("Cannot read properties
// of undefined"), so load its CommonJS build — same reason `db.server.ts` uses
// createRequire for sql.js. The variable is NOT named `require` on purpose:
// Vite rewrites calls to an identifier literally called `require` and would
// resolve the broken browser build instead.
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
    const { parseOffice } = nodeRequire("officeparser") as typeof import("officeparser");
    const ast = await parseOffice(buf, { fileType });
    // Spreadsheets keep their sheet structure as CSV; the rest as plain text.
    const sheet = fileType === "xlsx" || fileType === "ods";
    // Bind `ast` as the receiver: `to` delegates to a static generator with
    // `this`, so calling an unbound reference loses the AST and throws.
    const to = ast.to.bind(ast) as unknown as (fmt: string) => Promise<{ value?: unknown }>;
    const out = await to(sheet ? "csv" : "text");
    const text = String(out?.value ?? "").trim();
    if (!text) return { text: null, note: "El documento no contiene texto extraíble." };
    return { text };
  } catch (e) {
    return { text: null, note: `No se pudo leer el documento (${(e as Error).message}).` };
  }
}
