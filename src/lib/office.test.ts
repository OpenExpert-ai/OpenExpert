// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Minimal but valid .xlsx (a header row and one data row) generated once so the
// test never depends on a user file.
const XLSX_B64 =
  "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";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-office-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("extractOfficeText", () => {
  it("reads text from a .docx", async () => {
    const { parseOffice, generate } = await import("officeparser");
    const { extractOfficeText } = await import("./office.server");
    const ast = await parseOffice(Buffer.from("# Hola\n\nCuerpo del documento."), {
      fileType: "md",
    });
    const docx = (await generate(ast, "docx")).value as Uint8Array;
    const out = await extractOfficeText(docx, ".docx");
    expect(out.text).toContain("Hola");
    expect(out.text).toContain("Cuerpo del documento");
  });

  it("reads a spreadsheet as CSV (one block per sheet)", async () => {
    const { extractOfficeText } = await import("./office.server");
    const out = await extractOfficeText(Buffer.from(XLSX_B64, "base64"), ".xlsx");
    expect(out.text).toContain("Nombre,Valor");
    expect(out.text).toContain("Acme,42");
  });

  it("reports unsupported formats without throwing", async () => {
    const { extractOfficeText } = await import("./office.server");
    const out = await extractOfficeText(new Uint8Array([1, 2, 3]), ".zip");
    expect(out.text).toBeNull();
    expect(out.note).toBeTruthy();
  });

  it("is wired into local file reads", async () => {
    const { readLocalFile } = await import("./local-fs.server");
    const p = join(dir, "sample.xlsx");
    writeFileSync(p, Buffer.from(XLSX_B64, "base64"));
    const r = await readLocalFile(p, [dir]);
    expect(r.content).toContain("Acme,42");
  });
});
