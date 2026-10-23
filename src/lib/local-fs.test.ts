// SPDX-License-Identifier: MIT
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;
let root: string;
let outside: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-fs-"));
  root = join(dir, "root");
  outside = join(dir, "outside");
  mkdirSync(join(root, "sub"), { recursive: true });
  mkdirSync(join(root, "node_modules"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(root, "a.txt"), "hola");
  writeFileSync(join(root, ".hidden"), "no");
  writeFileSync(join(root, "node_modules", "x.js"), "no");
  writeFileSync(join(root, "sub", "b.md"), "# b");
  writeFileSync(join(outside, "secret.txt"), "secreto");
  symlinkSync(outside, join(root, "link"));
  // XDG trash (skipped by location) and a legitimate folder that simply is
  // called "Trash" (must stay visible).
  mkdirSync(join(root, ".local", "share", "Trash", "files"), { recursive: true });
  writeFileSync(join(root, ".local", "share", "Trash", "files", "deleted.txt"), "no");
  mkdirSync(join(root, "Trash"), { recursive: true });
  writeFileSync(join(root, "Trash", "keep.txt"), "sí");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("resolveWithinRoots", () => {
  it("accepts paths inside a granted root", async () => {
    const fs = await import("./local-fs.server");
    expect(fs.resolveWithinRoots(join(root, "a.txt"), [root])).toBe(join(root, "a.txt"));
  });

  it("rejects paths outside the granted roots", async () => {
    const fs = await import("./local-fs.server");
    expect(() => fs.resolveWithinRoots(join(outside, "secret.txt"), [root])).toThrow();
  });

  it("rejects a symlink that escapes the root", async () => {
    const fs = await import("./local-fs.server");
    expect(() => fs.resolveWithinRoots(join(root, "link", "secret.txt"), [root])).toThrow();
  });

  it("rejects everything when no root is granted", async () => {
    const fs = await import("./local-fs.server");
    expect(() => fs.resolveWithinRoots(join(root, "a.txt"), [])).toThrow();
  });
});

describe("listLocalFiles", () => {
  it("walks recursively but skips dotfiles, ignored dirs and symlink escapes", async () => {
    const fs = await import("./local-fs.server");
    const names = fs.listLocalFiles([root]).files.map((f) => f.name);
    expect(names).toContain("a.txt");
    expect(names).toContain("b.md");
    expect(names).not.toContain(".hidden");
    expect(names).not.toContain("x.js");
    expect(names).not.toContain("secret.txt");
  });

  it("says the walk was cut in the cap instead of passing it off as the folder size", async () => {
    const fs = await import("./local-fs.server");
    const capped = fs.listLocalFiles([root], { maxFiles: 2 });
    expect(capped.files).toHaveLength(2);
    expect(capped.truncated).toBe(true);

    const whole = fs.listLocalFiles([root]);
    expect(whole.truncated).toBe(false);
    expect(whole.files.length).toBeGreaterThan(2);
  });

  it("counts the depth cap as a cut: the folders below it stay unvisited", async () => {
    const fs = await import("./local-fs.server");
    const shallow = fs.listLocalFiles([root], { maxDepth: 0 });
    expect(shallow.files.map((f) => f.name)).not.toContain("b.md");
    expect(shallow.truncated).toBe(true);
  });
});

describe("read / write / create", () => {
  it("reads a text file inside the root", async () => {
    const fs = await import("./local-fs.server");
    const r = await fs.readLocalFile(join(root, "a.txt"), [root]);
    expect(r.content).toBe("hola");
  });

  it("refuses to read outside the root", async () => {
    const fs = await import("./local-fs.server");
    await expect(fs.readLocalFile(join(outside, "secret.txt"), [root])).rejects.toThrow();
  });

  it("writes and creates files only inside the root", async () => {
    const fs = await import("./local-fs.server");
    fs.writeLocalFile(join(root, "a.txt"), [root], "adiós");
    expect((await fs.readLocalFile(join(root, "a.txt"), [root])).content).toBe("adiós");

    const created = fs.createLocalFile(root, "new.txt", [root], "nuevo");
    expect(created.name).toBe("new.txt");
    expect(() => fs.createLocalFile(root, "new.txt", [root], "dup")).toThrow();

    expect(() => fs.createLocalFile(outside, "evil.txt", [root], "x")).toThrow();
  });
});

describe("createLocalFile y los enlaces simbólicos", () => {
  it("no escribe fuera de la raíz a través de un enlace roto", async () => {
    const fs = await import("./local-fs.server");
    const victima = join(outside, "victima.md");
    // El enlace existe en la carpeta autorizada y apunta a un fichero de fuera que aún no existe:
    // `existsSync` responde false (sigue el enlace) y el write lo creaba al otro lado.
    symlinkSync(victima, join(root, "roto.md"));
    expect(() => fs.createLocalFile(root, "roto.md", [root], "escrito")).toThrow(/Ya existe/);
    expect(existsSync(victima)).toBe(false);
  });

  it("tampoco escribe fuera a través de un enlace válido", async () => {
    const fs = await import("./local-fs.server");
    const victima = join(outside, "secuestrado.md");
    writeFileSync(victima, "original");
    symlinkSync(victima, join(root, "valido.md"));
    expect(() => fs.createLocalFile(root, "valido.md", [root], "escrito")).toThrow(
      /fuera de las carpetas autorizadas/,
    );
    expect(readFileSync(victima, "utf8")).toBe("original");
  });

  it("sigue creando el archivo cuando el nombre está libre", async () => {
    const fs = await import("./local-fs.server");
    const created = fs.createLocalFile(root, "libre.txt", [root], "contenido");
    expect(created.name).toBe("libre.txt");
    expect(readFileSync(join(root, "libre.txt"), "utf8")).toBe("contenido");
  });
});

describe("browseDirectory", () => {
  it("lists directories only in a navigable shape", async () => {
    const fs = await import("./local-fs.server");
    const view = fs.browseDirectory(root);
    expect(view.path).toBe(root);
    expect(view.entries.some((e) => e.name === "sub" && e.isDirectory)).toBe(true);
  });

  it("hides the XDG trash but keeps a folder that is merely called Trash", async () => {
    const fs = await import("./local-fs.server");
    const atRoot = fs.browseDirectory(root);
    expect(atRoot.entries.map((e) => e.name)).toContain("Trash");

    const xdgData = fs.browseDirectory(join(root, ".local", "share"));
    expect(xdgData.entries.map((e) => e.name)).not.toContain("Trash");
  });
});

describe("XDG trash", () => {
  it("does not walk the trash but walks other Trash folders", async () => {
    const fs = await import("./local-fs.server");
    const names = fs.listLocalFiles([root]).files.map((f) => f.name);
    expect(names).not.toContain("deleted.txt");
    expect(names).toContain("keep.txt");
  });
});

describe("windowed reads", () => {
  it("returns the file in lines and says whether there is more", async () => {
    const fs = await import("./local-fs.server");
    const big = join(root, "big.txt");
    writeFileSync(big, Array.from({ length: 250 }, (_, i) => `line ${i + 1}`).join("\n"));

    const first = await fs.readLocalFile(big, [root], { limit: 100 });
    expect(first.totalLines).toBe(250);
    expect(first.content?.split("\n")).toHaveLength(100);
    expect(first.content?.startsWith("line 1\n")).toBe(true);
    expect(first.hasMore).toBe(true);
    expect(first.nextOffset).toBe(101);

    const next = await fs.readLocalFile(big, [root], {
      offset: first.nextOffset,
      limit: 100,
    });
    expect(next.content?.startsWith("line 101")).toBe(true);

    // The tail used to be out of reach entirely: past the character cap, nothing said so.
    const last = await fs.readLocalFile(big, [root], { offset: 201, limit: 100 });
    expect(last.hasMore).toBeUndefined();
    expect(last.content?.trim().endsWith("line 250")).toBe(true);
  });

  it("keeps the rest of a line longer than the character cap within reach", async () => {
    const fs = await import("./local-fs.server");
    const one = join(root, "one-line.json");
    // A position-dependent pattern, so a gap or a repeated piece shows up in the comparison.
    const body = Array.from({ length: 30_000 }, (_, i) => String(i).padStart(10, "0")).join("");
    expect(body).toHaveLength(300_000);
    writeFileSync(one, body);

    const first = await fs.readLocalFile(one, [root]);
    expect(first.totalLines).toBe(1);
    expect(first.content).toHaveLength(200_000);
    expect(first.truncated).toBe(true);
    expect(first.hasMore).toBe(true);
    expect(first.nextOffset).toBe(1);
    expect(first.nextCharOffset).toBe(200_000);

    const rest = await fs.readLocalFile(one, [root], {
      offset: first.nextOffset,
      charOffset: first.nextCharOffset,
    });
    expect(rest.content).toHaveLength(100_000);
    expect(rest.truncated).toBeUndefined();
    expect(rest.hasMore).toBeUndefined();
    expect((first.content ?? "") + (rest.content ?? "")).toBe(body);
  });

  it("cuts through a long line in a multi-line file and resumes at that character", async () => {
    const fs = await import("./local-fs.server");
    const mixed = join(root, "mixed.log");
    const long = "y".repeat(250_000);
    writeFileSync(mixed, `header\n${long}\ntail`);

    const first = await fs.readLocalFile(mixed, [root], { limit: 10 });
    expect(first.totalLines).toBe(3);
    expect(first.content?.startsWith("header\n")).toBe(true);
    expect(first.content).toHaveLength(200_000);
    // It stopped inside line 2, not at the end of it: "header" plus the newline it carries.
    expect(first.nextOffset).toBe(2);
    expect(first.nextCharOffset).toBe(200_000 - "header".length - 1);
    expect(first.hasMore).toBe(true);

    const rest = await fs.readLocalFile(mixed, [root], {
      offset: first.nextOffset,
      charOffset: first.nextCharOffset,
    });
    expect((first.content ?? "") + (rest.content ?? "")).toBe(`header\n${long}\ntail`);
    expect(rest.hasMore).toBeUndefined();
  });

  it("explains an offset past the last line instead of returning an empty window", async () => {
    const fs = await import("./local-fs.server");
    const small = join(root, "three.txt");
    writeFileSync(small, "uno\ndos\ntres\n");

    const out = await fs.readLocalFile(small, [root], { offset: 9 });
    expect(out.content).toBeNull();
    expect(out.note).toMatch(/offset 9/);
    expect(out.note).toMatch(/4 línea/);
  });

  it("describes a CSV as a table, without counting the header as a data row", async () => {
    const fs = await import("./local-fs.server");
    const csv = join(root, "invoices.csv");
    writeFileSync(csv, "date,client,total\n2026-01-01,ACME,100\n2026-02-01,ACME,250\n");
    const r = await fs.readLocalFile(csv, [root]);
    expect(r.sheets?.[0]?.columns).toEqual(["date", "client", "total"]);
    expect(r.sheets?.[0]?.rows).toBe(2);
  });

  it("no cuenta como fila el salto de línea de una celda entrecomillada", async () => {
    const fs = await import("./local-fs.server");
    const csv = join(root, "clientes.csv");
    writeFileSync(csv, 'nombre,direccion\nAna,"Calle Mayor 1\n2 B"\nLuis,"Plaza 3"\n');
    const r = await fs.readLocalFile(csv, [root]);
    expect(r.sheets?.[0]?.rows).toBe(2);
    expect(r.sheets?.[0]?.columns).toEqual(["nombre", "direccion"]);
  });

  it("no parte una cabecera entrecomillada por la coma de dentro", async () => {
    const fs = await import("./local-fs.server");
    const csv = join(root, "ventas.csv");
    writeFileSync(csv, '"cliente, nombre",importe\nAna,100\n');
    const r = await fs.readLocalFile(csv, [root]);
    expect(r.sheets?.[0]?.columns).toEqual(["cliente, nombre", "importe"]);
    expect(r.sheets?.[0]?.rows).toBe(1);
  });

  it("mantiene el recuento con comillas escapadas, campos vacíos y líneas en blanco", async () => {
    const fs = await import("./local-fs.server");
    const csv = join(root, "notas.csv");
    writeFileSync(csv, '"campo ""raro""",nota\n1,"Dijo ""hola"""\n2,\n\n3,""\n');
    const r = await fs.readLocalFile(csv, [root]);
    expect(r.sheets?.[0]?.columns).toEqual(['campo "raro"', "nota"]);
    // La línea en blanco no es fila; el campo entrecomillado vacío sí, y el campo vacío final también.
    expect(r.sheets?.[0]?.rows).toBe(3);
  });
  it("elige el separador por el contenido: un CSV con punto y coma da sus tres columnas", async () => {
    const fs = await import("./local-fs.server");
    const csv = join(root, "ventas-punto-y-coma.csv");
    writeFileSync(
      csv,
      "Cliente;Importe;Fecha\nAcme;1.500,00;2026-01-02\nBeta;2.300,50;2026-01-03\nGamma;980,00;2026-01-04\n",
    );
    const r = await fs.readLocalFile(csv, [root]);
    expect(r.sheets?.[0]?.columns).toEqual(["Cliente", "Importe", "Fecha"]);
    expect(r.sheets?.[0]?.rows).toBe(3);

    const pipes = join(root, "ventas-pipes.csv");
    writeFileSync(pipes, "cliente|importe\nAcme|1500\nBeta|2300\n");
    const p = await fs.readLocalFile(pipes, [root]);
    expect(p.sheets?.[0]?.columns).toEqual(["cliente", "importe"]);
    expect(p.sheets?.[0]?.rows).toBe(2);
  });

  it("mantiene el tabulador del .tsv como separador", async () => {
    const fs = await import("./local-fs.server");
    const tsv = join(root, "ventas-tabs.tsv");
    writeFileSync(tsv, "cliente\timporte\nAcme\t1500\nBeta\t2300\n");
    const r = await fs.readLocalFile(tsv, [root]);
    expect(r.sheets?.[0]?.columns).toEqual(["cliente", "importe"]);
    expect(r.sheets?.[0]?.rows).toBe(2);
  });

  it("deja en una columna un CSV sin separadores y no cambia por un «;» entre comillas", async () => {
    const fs = await import("./local-fs.server");
    const single = join(root, "una-columna.csv");
    writeFileSync(single, "correo\nana@example.com\nluis@example.com\n");
    const one = await fs.readLocalFile(single, [root]);
    expect(one.sheets?.[0]?.columns).toEqual(["correo"]);
    expect(one.sheets?.[0]?.rows).toBe(2);

    const quoted = join(root, "alias.csv");
    writeFileSync(quoted, '"nombre; alias",importe\nAna,100\n');
    const two = await fs.readLocalFile(quoted, [root]);
    expect(two.sheets?.[0]?.columns).toEqual(["nombre; alias", "importe"]);
    expect(two.sheets?.[0]?.rows).toBe(1);
  });

  it("quita el BOM de la primera columna de un CSV exportado como «CSV UTF-8»", async () => {
    const fs = await import("./local-fs.server");
    const csv = join(root, "bom.csv");
    writeFileSync(csv, "\ufeffcliente,importe\nAcme,1500\n");
    const r = await fs.readLocalFile(csv, [root]);
    expect(r.sheets?.[0]?.columns).toEqual(["cliente", "importe"]);
    expect(r.sheets?.[0]?.rows).toBe(1);
  });
});

describe("searchLocalContent", () => {
  it("finds text inside files, ignoring case and accents", async () => {
    const fs = await import("./local-fs.server");
    writeFileSync(join(root, "clients.md"), "first line\nthe client is ACME, S.L.\n");
    const lower = await fs.searchLocalContent([root], "acme");
    expect(lower.hits.some((h) => h.name === "clients.md" && h.line === 2)).toBe(true);

    writeFileSync(join(root, "annual.md"), "FACTURACIÓN anual\n");
    const accented = await fs.searchLocalContent([root], "facturacion");
    expect(accented.hits.some((h) => h.name === "annual.md")).toBe(true);
  });

  it("stays inside the granted roots and bounds the work", async () => {
    const fs = await import("./local-fs.server");
    const outsideHit = await fs.searchLocalContent([root], "secreto");
    expect(outsideHit.hits).toHaveLength(0);

    const empty = await fs.searchLocalContent([root], "   ");
    expect(empty.hits).toHaveLength(0);
    expect(empty.note).toBeDefined();

    writeFileSync(join(root, "many.txt"), Array.from({ length: 20 }, () => "needle").join("\n"));
    const capped = await fs.searchLocalContent([root], "needle", { maxHits: 3 });
    expect(capped.hits).toHaveLength(3);
    expect(capped.hasMore).toBe(true);
  });

  it("keeps «hay más coincidencias» for the hit cap and says what it skipped for the file cap", async () => {
    const fs = await import("./local-fs.server");
    const many = join(dir, "busqueda");
    mkdirSync(many, { recursive: true });
    writeFileSync(join(many, "a.txt"), Array.from({ length: 20 }, () => "needle").join("\n"));
    const byHits = await fs.searchLocalContent([many], "needle", { maxHits: 3 });
    expect(String(byHits.note)).toContain("Hay más coincidencias");
    expect(byHits.unscanned).toBeUndefined();

    for (let i = 0; i < 5; i += 1) writeFileSync(join(many, `vacio-${i}.txt`), "sin la palabra\n");
    const byFiles = await fs.searchLocalContent([many], "ausente", { maxFiles: 2 });
    expect(byFiles.scanned).toBe(2);
    expect(byFiles.unscanned).toBe(4);
    expect(byFiles.hasMore).toBe(true);
    expect(String(byFiles.note)).toContain("quedan 4 sin revisar");
    expect(String(byFiles.note)).not.toContain("Hay más coincidencias");
  });

  it("concuerda en singular cuando solo queda un archivo sin revisar", async () => {
    const fs = await import("./local-fs.server");
    const many = join(dir, "busqueda-singular");
    mkdirSync(many, { recursive: true });
    for (let i = 0; i < 3; i += 1) writeFileSync(join(many, `vacio-${i}.txt`), "sin la palabra\n");
    const out = await fs.searchLocalContent([many], "ausente", { maxFiles: 2 });
    expect(out.scanned).toBe(2);
    expect(out.unscanned).toBe(1);
    expect(String(out.note)).toContain("queda 1 sin revisar");
    expect(String(out.note)).not.toContain("quedan 1 sin revisar");
  });
});

/**
 * El selector del panel no puede callarse un corte. `browseDirectory` para a las
 * `MAX_BROWSE_ENTRIES` (2 000) entradas y hasta ahora lo hacia **antes** de
 * ordenar y sin decirlo: en una carpeta de 2 120 entradas el dialogo enseñaba
 * 2 000 en el orden del `readdir` —que no pone las carpetas primero— y podia
 * dejar fuera las subcarpetas, que son la unica forma de navegar a lo que no
 * salio en la lista. El usuario no tenia ni el dato ni el aviso.
 */
describe("browseDirectory en una carpeta grande", () => {
  let big: string;
  const FOLDERS = 20;
  const FILES = 2_100;

  beforeAll(() => {
    big = join(dir, "carpeta-grande");
    mkdirSync(big, { recursive: true });
    for (let i = 1; i <= FILES; i += 1) {
      writeFileSync(join(big, `doc-${String(i).padStart(4, "0")}.txt`), "x");
    }
    for (let i = 0; i < FOLDERS; i += 1) {
      mkdirSync(join(big, `sub-${String(i).padStart(2, "0")}`));
    }
  });

  type View = {
    entries: { name: string; isDirectory: boolean }[];
    truncated?: boolean;
    total?: number;
  };

  it("dice que la lista viene cortada y cuántas entradas hay de verdad", async () => {
    const fs = await import("./local-fs.server");
    const view = fs.browseDirectory(big) as unknown as View;

    expect(view.entries).toHaveLength(2_000);
    expect(view.truncated).toBe(true);
    expect(view.total).toBe(FILES + FOLDERS);
  });

  it("ordena antes de cortar, así que no se come las subcarpetas", async () => {
    const fs = await import("./local-fs.server");
    const view = fs.browseDirectory(big) as unknown as View;
    const names = view.entries.map((e) => e.name);

    // Las carpetas son lo navegable: el corte no puede dejarlas fuera.
    expect(names.filter((n) => n.startsWith("sub-"))).toHaveLength(FOLDERS);
    // Y la lista es estable entre dos peticiones iguales.
    const again = (fs.browseDirectory(big) as unknown as View).entries.map((e) => e.name);
    expect(again).toEqual(names);
    // Con las carpetas delante, la primera entrada es una carpeta.
    expect(view.entries[0]?.isDirectory).toBe(true);
  });

  it("una carpeta que cabe entera no se marca como cortada", async () => {
    const fs = await import("./local-fs.server");
    const small = join(dir, "carpeta-pequena");
    mkdirSync(join(small, "dentro"), { recursive: true });
    writeFileSync(join(small, "uno.txt"), "x");

    const view = fs.browseDirectory(small) as unknown as View;

    // Sin corte, el aviso no se pinta: `total` es el recuento y nada falta.
    expect(view.truncated).toBe(false);
    expect(view.total).toBe(2);
    expect(view.entries.map((e) => e.name)).toEqual(["dentro", "uno.txt"]);
  });
});
