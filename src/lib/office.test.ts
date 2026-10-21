// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Minimal but valid Office files generated once, so the tests never depend on a
// user file: a .docx (two paragraphs), a .xlsx (header + one row) and a .pptx
// (two runs of text).
const DOCX_B64 =
  "UEsDBBQAAAAIAPgGRl15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgA+AZGXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIAPgGRl3AyjE4rgAAAAgBAAARAAAAd29yZC9kb2N1bWVudC54bWxtj9EKwjAMRX+l9N11+iAy1vkgiB+gH1DbuA3apLSdc39vKwxBfDnhkuTepD2+nGVPCHEklHxb1ZwBajIj9pLfrufNgbOYFBplCUHyBSI/du3cGNKTA0wsG2BsZsmHlHwjRNQDOBUr8oC596DgVMoy9GKmYHwgDTFmf2fFrq73wqkRebG8k1lK9QWhIHUXsoq5CQ21oujC8KH/HT1NEDwxA5atx/1bEmuQ+D7RvQFQSwECFAMUAAAACAD4BkZdeW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIAPgGRl2b/TfqrQAAACkBAAALAAAAAAAAAAAAAACAARkBAABfcmVscy8ucmVsc1BLAQIUAxQAAAAIAPgGRl3AyjE4rgAAAAgBAAARAAAAAAAAAAAAAACAAe8BAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAADMAgAAAAA=";
const XLSX_B64 =
  "UEsDBBQAAAAIAGkARl3FLx19AAEAAC4CAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK2RzU7DMBCE7zyF5WsVO+WAEErSQ4EjcCgPsDibxIr/5HVL+vY4aeGAClw4reyZ2W9kV5vJGnbASNq7mq9FyRk65Vvt+pq/7h6LW84ogWvBeIc1PyLxTXNV7Y4BieWwo5oPKYU7KUkNaIGED+iy0vloIeVj7GUANUKP8rosb6TyLqFLRZp38Ka6xw72JrGHKV+fikQ0xNn2ZJxZNYcQjFaQsi4Prv1GKc4EkZOLhwYdaJUNXF4kzMrPgHPuOb9M1C2yF4jpCWx2ycnIdx/HN+9H8fuSCy1912mFrVd7myOCQkRoaUBM1ohlCgvarf7mL2aSy1j/c5Gv/Z895PLdzQdQSwMEFAAAAAgAaQBGXQZZx4KxAAAAKAEAAAsAAABfcmVscy8ucmVsc43PsQ6CMBAG4N2naG6XgoMxhsJiTFgNPkBtj0KAXtNWhbe3oxoHx8v99/25sl7miT3Qh4GsgCLLgaFVpAdrBFzb8/YALERptZzIooAVA9TVprzgJGO6Cf3gAkuIDQL6GN2R86B6nGXIyKFNm478LGMaveFOqlEa5Ls833P/bkD1YbJGC/CNLoC1q8N/bOq6QeGJ1H1GG39UfCWSLL3BKGCZ+JP8eCMas4QCr0r+8WD1AlBLAwQUAAAACABpAEZdbk+qHr4AAAAbAQAADwAAAHhsL3dvcmtib29rLnhtbI2PTW7CQAyF9z3FyPsySRcIRUnYVFXZwwHcjEOmZOzInha4PdNS9l35T+/ze+32kmb3TWpRuIN6VYEjHiREPnZw2L89b8BZRg44C1MHVzLY9k/tWfT0IXJyRc/WwZTz0nhvw0QJbSULcbmMoglzGfXobVHCYBNRTrN/qaq1TxgZ7oRG/8OQcYwDvcrwlYjzHaI0Yy7ubYqLQd/+frC/6hhTcf0un1iXID+rXSg5wWkTS6O7UIPvW/9Q+Uew/gZQSwMEFAAAAAgAaQBGXZpvPHy1AAAAKQEAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc43PzQrCMAwH8LtPUXJ32TyIyLpdRNhV5gOULvtgW1ua+rG3t3gQBx48heRPfiF5+ZwncSfPgzUSsiQFQUbbZjCdhGt93h5AcFCmUZM1JGEhhrLY5BeaVIg73A+ORUQMS+hDcEdE1j3NihPryMSktX5WIba+Q6f0qDrCXZru0X8bUKxMUTUSfNVkIOrF0T+2bdtB08nq20wm/DiBD+tH7olCRJXvKEj4jBjfJUuiCljkuPqweAFQSwMEFAAAAAgAaQBGXauPz6XUAAAAdAEAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWx1kE9rwzAMxe/7FMb3VmkYYwzbpaPsuMv+3D1HbcxiOcgi3b79nDJCB+tNeuL3niSz/UqDmpBLzGT1Zt1ohRRyF+lo9dvr0+peqyKeOj9kQqu/seituzGnzJ+lRxRVDahY3YuMDwAl9Jh8WecRqU4OmZOX2vIRysjouzOUBmib5g6Sj6SdOWt7L94ZzifFdZGqhrnYbbQSqyMNkfBFuOqxOCPuOacPRgPiDMwKhF/i8RrxXk/gvwDUuCWzXTLbKw67kP5NnMnJ3bYGpktfuLgLloe5H1BLAQIUAxQAAAAIAGkARl3FLx19AAEAAC4CAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAaQBGXQZZx4KxAAAAKAEAAAsAAAAAAAAAAAAAAIABMQEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgAaQBGXW5Pqh6+AAAAGwEAAA8AAAAAAAAAAAAAAIABCwIAAHhsL3dvcmtib29rLnhtbFBLAQIUAxQAAAAIAGkARl2abzx8tQAAACkBAAAaAAAAAAAAAAAAAACAAfYCAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc1BLAQIUAxQAAAAIAGkARl2rj8+l1AAAAHQBAAAYAAAAAAAAAAAAAACAAeMDAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxQSwUGAAAAAAUABQBFAQAA7QQAAAAA";
const PPTX_B64 =
  "UEsDBBQAAAAIAPgGRl2sDIeS5wAAAKcBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QzU7DMAx+lShX1KTbASHUdgcYR+AwHsBK3TZa/hRn0/b2uO24oMHJsr9fudldvBNnzGRjaOVG1VJgMLG3YWzl1+GtepKCCoQeXAzYyiuS3HXN4ZqQBGsDtXIqJT1rTWZCD6RiwsDIELOHwmsedQJzhBH1tq4ftYmhYChVmT1k17ziACdXxP7C57VHRkdSvKzEOauVkJKzBgrj+hz6XynVLUGxcuHQZBM9MEHquwkz8nfATffBj8m2R/EJubyDZ5ZOqWhyfKR1bNT/Vne6xmGwBvtoTp4lKmUkngvdO7W4/jTXy6O7b1BLAwQUAAAACAD4BkZdJeIxG60AAAAgAQAACwAAAF9yZWxzLy5yZWxzjc9NCsIwEAXgq4TZ27QuRKSpGxG6lXqAkEzTYPNDJoq9vUFcWHDh8s3wvmHa49PN7IGJbPACmqoGhl4Fbb0RcB3Omz0wytJrOQePAhYkOHbtBWeZS4UmG4kVw5OAKed44JzUhE5SFSL6shlDcjKXmAyPUt2kQb6t6x1P3wasTdZrAanXDbBhifiPHcbRKjwFdXfo848TnGarsYAyGcwC3vEzbaqiAe9avvqsewFQSwMEFAAAAAgA+AZGXZvk8OnRAAAAdQEAABUAAABwcHQvc2xpZGVzL3NsaWRlMS54bWyNkN1KxDAQRl8l5N6d6oVIabug4AtYH2Boxt1AMhmSce2+vUlXWRQvvDnk75vvkGG/xmBOlItPPNrbXWcN8ZKc58NoX+fnmwdriiI7DIlptGcqdj8N0pfgTM1y6WW0R1XpAcpypIhll4S43r2lHFHrNh9AMhViRa09McBd191DRM/2awj+Z4jL+FHFfuSby/IS3OYkcya6rBp1fUzuPA3YS0Nu0Gn2+h6ScR4lFa/+hAO088a8UX5HnhIrsXfJiOj6x3O4lsGlHa468G0I27dNn1BLAQIUAxQAAAAIAPgGRl2sDIeS5wAAAKcBAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgA+AZGXSXiMRutAAAAIAEAAAsAAAAAAAAAAAAAAIABGAEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgA+AZGXZvk8OnRAAAAdQEAABUAAAAAAAAAAAAAAIAB7gEAAHBwdC9zbGlkZXMvc2xpZGUxLnhtbFBLBQYAAAAAAwADAL0AAADyAgAAAAA=";
const ODT_B64 =
  "UEsDBBQAAAAIAHEIRl1exjIMKQAAACcAAAAIAAAAbWltZXR5cGVLLCjIyUxOLMnMz9Mvy0vRy08szizWyy9IzUvJTy7NTc0r0StJrSgBAFBLAwQUAAAACABxCEZdt11FsKgAAABFAQAACwAAAGNvbnRlbnQueG1sjVBLDoIwEL1K0z1Wd6aBsjHGnQvxALUMpgnMkLYYPI5n8WLyEZSFiavJvO9k4rStSnYD5y1hwjerNWeAhnKL14Sfs3205amKqSisAZmTaSrAEBnC0E3WmdHLkU1441CS9tZL1BV4GYykGnByyW+1HKpGJEAb/nX32sE7H3Wh/D4vPa3iQVSrA5WaHXdZLN7ARJzg2nTBrH4+nNMFfQRikSMWFeLHF9QLUEsBAhQDFAAAAAgAcQhGXV7GMgwpAAAAJwAAAAgAAAAAAAAAAAAAAIABAAAAAG1pbWV0eXBlUEsBAhQDFAAAAAgAcQhGXbddRbCoAAAARQEAAAsAAAAAAAAAAAAAAIABTwAAAGNvbnRlbnQueG1sUEsFBgAAAAACAAIAbwAAACABAAAAAA==";

/**
 * ZIP whose entries declare a different uncompressed size than they carry.
 *
 * The size on disk never says what a document will cost in memory, and that declared size is what
 * a reader has to check before inflating. Building the bomb by really compressing 256 MB of zeros
 * spends seconds of CPU on a CI runner (fflate's deflate on zeros took 8 s there, past the test
 * timeout), so the size is written into both headers instead: `fflate` sizes its output buffer from
 * the central directory, so the old reader still allocated it, and the cap reads the same field.
 */
async function zipDeclaringSizes(
  files: Record<string, Uint8Array>,
  declared: Record<string, number>,
): Promise<Uint8Array> {
  const { zipSync } = await import("fflate");
  const zip = zipSync(files);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // End of central directory: 22 bytes of fixed fields when the archive has no comment.
  const eocd = zip.byteLength - 22;
  const entries = view.getUint16(eocd + 10, true);
  let cd = view.getUint32(eocd + 16, true);
  for (let i = 0; i < entries; i += 1) {
    const nameLength = view.getUint16(cd + 28, true);
    const extraLength = view.getUint16(cd + 30, true);
    const commentLength = view.getUint16(cd + 32, true);
    const name = new TextDecoder().decode(zip.subarray(cd + 46, cd + 46 + nameLength));
    const size = declared[name];
    if (size !== undefined) {
      view.setUint32(cd + 24, size, true); // central directory: uncompressed size
      view.setUint32(view.getUint32(cd + 42, true) + 22, size, true); // local header: same field
    }
    cd += 46 + nameLength + extraLength + commentLength;
  }
  return zip;
}

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-office-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("extractOfficeText", () => {
  it("reads text from a .docx", async () => {
    const { extractOfficeText } = await import("./office.server");
    const out = await extractOfficeText(Buffer.from(DOCX_B64, "base64"), ".docx");
    expect(out.text).toContain("Hola mundo");
    expect(out.text).toContain("Cuerpo del documento");
  });

  it("reads a spreadsheet as CSV (one block per sheet)", async () => {
    const { extractOfficeText } = await import("./office.server");
    const out = await extractOfficeText(Buffer.from(XLSX_B64, "base64"), ".xlsx");
    expect(out.text).toContain("Nombre,Valor");
    expect(out.text).toContain("Acme,42");
  });

  it("reads slide text from a .pptx", async () => {
    const { extractOfficeText } = await import("./office.server");
    const out = await extractOfficeText(Buffer.from(PPTX_B64, "base64"), ".pptx");
    expect(out.text).toContain("Titulo diapositiva");
    expect(out.text).toContain("Contenido pptx");
  });

  it("reads .pptx slides in slide order, not in entry-name order", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const { extractOfficeText } = await import("./office.server");
    // As strings, `slide10.xml` sorts before `slide2.xml`; with nine slides or
    // fewer the two orders agree, which is why this needs a longer deck.
    const files: Record<string, Uint8Array> = {};
    for (let n = 1; n <= 12; n++)
      files[`ppt/slides/slide${n}.xml`] = strToU8(`<p:sld><a:t>Diapositiva ${n}</a:t></p:sld>`);
    const out = await extractOfficeText(zipSync(files), ".pptx");
    const slides = (out.text ?? "").split("\n").map((line) => line.trim());
    expect(slides).toEqual(Array.from({ length: 12 }, (_, i) => `Diapositiva ${i + 1}`));
  });

  it("reads paragraph text from an OpenDocument file", async () => {
    const { extractOfficeText } = await import("./office.server");
    const out = await extractOfficeText(Buffer.from(ODT_B64, "base64"), ".odt");
    expect(out.text).toContain("Hola ODT");
    expect(out.text).toContain("Segundo párrafo");
  });

  it("reads .odt paragraphs and headings in document order", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const { extractOfficeText } = await import("./office.server");
    // The reader used to walk `content.xml` twice and concatenate —every paragraph, then every
    // heading— so a document read as its body followed by all its titles: a section and its
    // heading ended up far apart, with no error to show for it.
    const xml =
      "<office:document-content><office:body><office:text>" +
      '<text:h text:style-name="Heading_20_1">Capitulo uno</text:h>' +
      '<text:p text:style-name="Standard">Primer parrafo del capitulo uno.</text:p>' +
      '<text:h text:style-name="Heading_20_1">Capitulo dos</text:h>' +
      '<text:p text:style-name="Standard">Primer parrafo del capitulo dos.</text:p>' +
      '<text:p text:style-name="Standard">Segundo parrafo del capitulo dos.</text:p>' +
      "</office:text></office:body></office:document-content>";
    const out = await extractOfficeText(zipSync({ "content.xml": strToU8(xml) }), ".odt");
    const lines = (out.text ?? "").split(String.fromCharCode(10)).map((line) => line.trim());
    expect(lines).toEqual([
      "Capitulo uno",
      "Primer parrafo del capitulo uno.",
      "Capitulo dos",
      "Primer parrafo del capitulo dos.",
      "Segundo parrafo del capitulo dos.",
    ]);
  });

  it("reads .ods cells in table order", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const { extractOfficeText } = await import("./office.server");
    // The same single reader serves .odt, .ods and .odp; a spreadsheet is its cells in order, so a
    // pass that only kept the heading/paragraph pair and dropped cells would empty every table.
    const xml =
      "<office:document-content><office:body><office:spreadsheet>" +
      '<table:table table:name="Hoja1"><table:table-row>' +
      "<table:table-cell><text:p>Nombre</text:p></table:table-cell>" +
      "<table:table-cell><text:p>Valor</text:p></table:table-cell>" +
      "</table:table-row><table:table-row>" +
      "<table:table-cell><text:p>Acme</text:p></table:table-cell>" +
      "<table:table-cell><text:p>42</text:p></table:table-cell>" +
      "</table:table-row></table:table></office:spreadsheet></office:body></office:document-content>";
    const out = await extractOfficeText(zipSync({ "content.xml": strToU8(xml) }), ".ods");
    const lines = (out.text ?? "").split(String.fromCharCode(10)).map((line) => line.trim());
    expect(lines).toEqual(["Nombre", "Valor", "Acme", "42"]);
  });

  it("keeps a stray `<` from malformed markup out of the text", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const { extractOfficeText } = await import("./office.server");
    // The second paragraph proves entities are decoded *after* the markup is
    // dropped: `&lt;` must survive as text, a raw `<` must not.
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><office:document-content>' +
      "<text:p>a <b c</text:p><text:p>5 &lt; 10</text:p></office:document-content>";
    const out = await extractOfficeText(zipSync({ "content.xml": strToU8(xml) }), ".odt");
    expect(out.text).toContain("a b c");
    expect(out.text).not.toContain("a <b c");
    expect(out.text).toContain("5 < 10");
  });

  it("refuses a document that declares more than the cap, without inflating it", async () => {
    const { extractOfficeText } = await import("./office.server");
    // The bomb is invisible in the file size: a few hundred bytes that declare 256 MB of
    // `content.xml`. The cap reads that number from the central directory, so the decision is made
    // before inflating; the old reader allocated the buffer and unzipped whatever came (the real
    // 256 MB-of-zeros file took 2 s and +549 MB of RSS, measured on this machine).
    const bomb = await zipDeclaringSizes(
      { "content.xml": new Uint8Array(1024) },
      { "content.xml": 256 * 1024 * 1024 },
    );
    expect(bomb.length).toBeLessThan(4096);
    const out = await extractOfficeText(bomb, ".odt");
    expect(out.text).toBeNull();
    expect(out.note).toContain("no se lee para no agotar la memoria");
  });

  it("inflates only the slides of a .pptx, never its media", async () => {
    const { strToU8 } = await import("fflate");
    const { extractOfficeText, MAX_OFFICE_UNCOMPRESSED_BYTES } = await import("./office.server");
    // A deck can carry a video bigger than the cap. It is never read, so it must neither be
    // inflated nor turn the document into "too big": the slide text comes back with no note.
    const deck = await zipDeclaringSizes(
      {
        "ppt/slides/slide1.xml": strToU8("<p:sld><a:t>Titulo diapositiva</a:t></p:sld>"),
        "ppt/media/video.bin": new Uint8Array(1024),
      },
      { "ppt/media/video.bin": MAX_OFFICE_UNCOMPRESSED_BYTES + 1024 * 1024 },
    );
    const out = await extractOfficeText(deck, ".pptx");
    expect(out.text).toContain("Titulo diapositiva");
    expect(out.note).toBeUndefined();
  });

  it("reports a broken Office file instead of throwing", async () => {
    const { extractOfficeText } = await import("./office.server");
    const out = await extractOfficeText(new Uint8Array([1, 2, 3]), ".docx");
    expect(out.text).toBeNull();
    expect(out.note).toBeTruthy();
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
