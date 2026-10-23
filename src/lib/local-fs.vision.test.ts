// SPDX-License-Identifier: MIT
// A scanned PDF has no text layer, so the pages are transcribed by a model. That transcription has
// a ceiling (200.000 characters), and the read is where the ceiling has to be visible: the caller
// window is capped at the same 200.000 characters, so a transcription cut at the top fits in a
// single read and, without a note, the model receives a document that looks complete and answers
// about the first half as if it were the whole thing.
//
// The two modules are exercised together and mocked only at the edges: `unpdf` yields no text (that
// is what a scan gives) and `generateText` is the model. Everything between them — the cut, the note
// and the read — is the real code.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateText: generate }));
vi.mock("./engine/model-provider.server", () => ({
  selectedProvider: () => "google",
  getLanguageModel: () => ({ id: "fake-model" }),
}));
vi.mock("unpdf", () => ({
  getDocumentProxy: async () => ({}),
  extractText: async () => ({ text: "" }),
}));

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-vision-read-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  generate.mockReset();
});

/** A file that ends in `.pdf`: the bytes never reach a real parser, `unpdf` is mocked. */
function scannedPdf(name: string): string {
  const path = join(dir, name);
  writeFileSync(path, "%PDF-1.4 escaneo sin capa de texto");
  return path;
}

describe("readLocalFile over a scanned PDF", () => {
  it("avisa en la lectura cuando la transcripción se ha recortado", async () => {
    const path = scannedPdf("contrato-largo.pdf");
    generate.mockResolvedValue({ text: "x".repeat(200_001) });
    const fs = await import("./local-fs.server");
    const r = await fs.readLocalFile(path, [dir], { vision: true });
    // Lo que se lee sigue siendo el tope, y el tope viaja con su recuento.
    expect(r.content).toHaveLength(200_000);
    expect(r.note).toMatch(/recort/i);
    expect(r.note).toMatch(/200\.000/);
    // `truncated` dice que lo devuelto no es el archivo entero. No hay `hasMore` a propósito:
    // el final no se transcribió, así que no hay `nextOffset` que pedir.
    expect(r.truncated).toBe(true);
    expect(r.hasMore).toBeUndefined();
    expect(r.nextOffset).toBeUndefined();
  });

  it("no inventa el aviso cuando la transcripción cabe entera", async () => {
    const path = scannedPdf("factura-corta.pdf");
    generate.mockResolvedValue({ text: "FACTURA 2026-001\nTotal: 1.234,00 €" });
    const fs = await import("./local-fs.server");
    const r = await fs.readLocalFile(path, [dir], { vision: true });
    expect(r.content).toBe("FACTURA 2026-001\nTotal: 1.234,00 €");
    expect(r.note).toBeUndefined();
    expect(r.truncated).toBeUndefined();
  });

  it("sin `vision` no se transcribe nada y la nota sigue diciendo por qué", async () => {
    const path = scannedPdf("escaneo-sin-permiso.pdf");
    const fs = await import("./local-fs.server");
    const r = await fs.readLocalFile(path, [dir]);
    expect(generate).not.toHaveBeenCalled();
    expect(r.content).toBeNull();
    expect(r.note).toContain("PDF escaneado sin texto seleccionable");
  });
});
