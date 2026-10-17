// SPDX-License-Identifier: MIT
// Local filesystem access for the single-owner edition.
//
// The browser cannot browse the disk, so the local server does it: it lists
// directories (names only) for the folder picker and reads/writes files only
// inside the folders the user explicitly granted. Every path is resolved with
// `realpath` and checked against the granted roots, which also defeats symlink
// escapes.
//
// Limits are deliberately generous (local, single owner) but bounded so a
// prompt cannot make the model walk an entire disk.

import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { OFFICE_EXT, extractOfficeText, type SheetInfo } from "./office.server";

/** Names never listed or walked, to avoid leaking secrets and huge trees. */
const IGNORED = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  ".cache",
  "secret.key",
  "credentials.json",
  "drive-grants.json",
  "local-roots.json",
  "secrets.json",
  "openexpert.db",
]);

/**
 * The XDG trash lives at `~/.local/share/Trash`, so it is skipped by its
 * *location*, not by name: a folder called `Trash` anywhere else is legitimate
 * and must stay visible. (Matching the whole `".local/share/Trash"` string
 * against a single directory name never matched anything.)
 */
function isXdgTrash(parent: string, name: string): boolean {
  return name === "Trash" && parent.endsWith(join(".local", "share"));
}

const MAX_READ_BYTES = 25 * 1024 * 1024; // 25 MB per file
const MAX_CHARS = 200_000; // returned to the model, then truncated
const MAX_WALK_FILES = 5_000;
const MAX_WALK_DEPTH = 8;
const MAX_BROWSE_ENTRIES = 2_000;

export type DirEntry = { name: string; path: string; isDirectory: boolean };

export type ListedFile = { path: string; name: string; size: number };

function safeRealpath(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : root + sep);
}

/** Resolve `target` and require it to live inside one of the granted roots. */
export function resolveWithinRoots(target: string, roots: string[]): string {
  if (!roots.length) throw new Error("No hay ninguna carpeta local autorizada.");
  const real = safeRealpath(target);
  if (!real) throw new Error("La ruta no existe o no se puede leer.");
  const resolvedRoots = roots.map((r) => safeRealpath(r) ?? r);
  if (!resolvedRoots.some((r) => isWithin(r, real)))
    throw new Error("La ruta está fuera de las carpetas autorizadas.");
  return real;
}

/** Validate a folder the user wants to grant and return its canonical path. */
export function rootInfo(path: string): { path: string; name: string } {
  const real = safeRealpath(resolve(path.trim()));
  if (!real) throw new Error("La carpeta no existe o no se puede leer.");
  if (!statSync(real).isDirectory()) throw new Error("Eso no es una carpeta.");
  return { path: real, name: basename(real) || real };
}

/* ------------------------------ browsing ------------------------------- */

/** Directory listing for the picker. No file contents, only names. */
export function browseDirectory(path?: string | null): {
  path: string;
  parent: string | null;
  entries: DirEntry[];
} {
  const target = resolve(path && path.trim() ? path.trim() : homedir());
  const real = safeRealpath(target);
  if (!real) throw new Error("La carpeta no existe o no se puede leer.");
  if (!statSync(real).isDirectory()) throw new Error("Eso no es una carpeta.");
  const entries: DirEntry[] = [];
  for (const e of readdirSync(real, { withFileTypes: true })) {
    if (IGNORED.has(e.name) || isXdgTrash(real, e.name)) continue;
    let isDirectory = e.isDirectory();
    // Follow symlinks to folders so navigation is intuitive; escape is still
    // blocked when reading, because resolveWithinRoots re-resolves the target.
    if (e.isSymbolicLink()) {
      const r = safeRealpath(join(real, e.name));
      if (!r) continue;
      try {
        isDirectory = statSync(r).isDirectory();
      } catch {
        continue;
      }
    }
    entries.push({ name: e.name, path: join(real, e.name), isDirectory });
    if (entries.length >= MAX_BROWSE_ENTRIES) break;
  }
  entries.sort((a, b) =>
    a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1,
  );
  const parent = dirname(real);
  return { path: real, parent: parent === real ? null : parent, entries };
}

/* ------------------------------ listing -------------------------------- */

/** Recursively list files under a granted folder, bounded in depth and count. */
export function listLocalFiles(roots: string[]): ListedFile[] {
  const out: ListedFile[] = [];
  const seen = new Set<string>();
  const resolvedRoots = roots.map((r) => safeRealpath(r) ?? r);
  const insideRoots = (p: string) => resolvedRoots.some((r) => isWithin(r, p));
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_WALK_DEPTH || out.length >= MAX_WALK_FILES) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_WALK_FILES) return;
      if (IGNORED.has(e.name) || isXdgTrash(dir, e.name) || e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      let target = full;
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) {
        // Never walk or list through a symlink that leaves the granted roots.
        const r = safeRealpath(full);
        if (!r || !insideRoots(r)) continue;
        target = r;
        try {
          isDir = statSync(r).isDirectory();
        } catch {
          continue;
        }
      }
      if (isDir) {
        walk(target, depth + 1);
      } else {
        if (seen.has(target)) continue;
        seen.add(target);
        let size: number;
        try {
          size = statSync(target).size;
        } catch {
          continue;
        }
        out.push({ path: target, name: e.name, size });
      }
    }
  };
  for (const r of resolvedRoots) walk(r, 0);
  return out;
}

/* ------------------------------- reading ------------------------------- */

export type LocalRead = {
  path: string;
  name: string;
  size: number;
  modifiedTime: string;
  content: string | null;
  truncated?: boolean;
  note?: string;
  /** Total lines in the file, so a caller knows whether there is more to ask for. */
  totalLines?: number;
  /** The window that was returned: `offset` is 1-based, like a line number. */
  offset?: number;
  limit?: number;
  /** Set when the file continues past this window: read again with `offset: nextOffset`. */
  hasMore?: boolean;
  nextOffset?: number;
  /** For spreadsheets and CSV: what the table is. */
  sheets?: SheetInfo[];
};

/** A literal, case- and accent-insensitive match inside a file. */
export type ContentHit = { path: string; name: string; line: number; text: string };

const TEXT_EXT = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".tsv",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cs",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".log",
  ".tex",
  ".rst",
  ".env",
  ".gitignore",
]);

/**
 * The shape of a CSV, read from the text itself: a CSV *is* its rows. The header is the first
 * non-empty line, and the data rows are the rest — counting the header as data would inflate
 * every table by one row.
 */
function csvStructure(text: string, name: string, delimiter: string): SheetInfo {
  const rows = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = (rows[0] ?? "")
    .split(delimiter)
    .map((cell) => cell.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
  return { name, rows: Math.max(0, rows.length - 1), columns: header };
}

async function extractText(
  abs: string,
): Promise<{ text: string | null; note?: string; sheets?: SheetInfo[] }> {
  const size = statSync(abs).size;
  if (size > MAX_READ_BYTES)
    return { text: null, note: `Archivo demasiado grande (${size} bytes > 25 MB).` };
  const buf = readFileSync(abs);
  const ext = extname(abs).toLowerCase();
  if (OFFICE_EXT.has(ext)) return extractOfficeText(new Uint8Array(buf), ext);
  if (ext === ".pdf") {
    const { extractText: extract, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const out = await extract(pdf, { mergePages: true });
    const text = String(out.text ?? "")
      .replace(/\s+\n/g, "\n")
      .trim();
    if (!text) return { text: null, note: "PDF escaneado sin texto seleccionable." };
    return { text };
  }
  if (!TEXT_EXT.has(ext) && buf.subarray(0, 8000).includes(0))
    return { text: null, note: "Tipo de archivo no legible como texto." };
  const text = buf.toString("utf8");
  // A CSV is a table in plain clothes: say what its columns are so the model does not have to
  // guess where the rows end. Without this it gets a comma-separated wall and counts by eye.
  if (ext === ".csv" || ext === ".tsv")
    return {
      text,
      sheets: [csvStructure(text, basename(abs), ext === ".tsv" ? "\t" : ",")],
    };
  return { text };
}

/** How many lines a read returns when the caller does not ask for a window. */
const DEFAULT_READ_LINES = 2_000;

/**
 * A read window. The properties admit an explicit `undefined` because the tool layer forwards its
 * optional arguments as-is, and this project type-checks with `exactOptionalPropertyTypes`.
 */
export type ReadOptions = { offset?: number | undefined; limit?: number | undefined };

export async function readLocalFile(
  target: string,
  roots: string[],
  opts: ReadOptions = {},
): Promise<LocalRead> {
  const abs = resolveWithinRoots(target, roots);
  const st = statSync(abs);
  if (!st.isFile()) throw new Error("Eso no es un archivo.");
  const { text, note, sheets } = await extractText(abs);
  const base: LocalRead = {
    path: abs,
    name: basename(abs),
    size: st.size,
    modifiedTime: st.mtime.toISOString(),
    content: null,
    ...(note ? { note } : {}),
  };
  if (!text) return base;
  // The file is returned in a **window of lines**, not as one slab. Before this, any file past the
  // character cap had its tail silently out of reach: the model could not ask for the rest, so a
  // big CSV was half-invisible and nothing said so. A line is what a person counts and what the
  // model can ask for again (`hasMore` + `nextOffset`).
  const lines = text.split("\n");
  const totalLines = lines.length;
  const offset = Math.max(1, Math.floor(opts.offset ?? 1));
  const limit = Math.max(1, Math.floor(opts.limit ?? DEFAULT_READ_LINES));
  const from = Math.min(offset - 1, totalLines);
  const window = lines.slice(from, from + limit);
  const joined = window.join("\n");
  const truncated = joined.length > MAX_CHARS;
  const lastLine = Math.min(totalLines, offset - 1 + window.length);
  const hasMore = lastLine < totalLines;
  return {
    ...base,
    content: truncated ? joined.slice(0, MAX_CHARS) : joined,
    totalLines,
    offset,
    limit,
    ...(truncated ? { truncated: true } : {}),
    ...(hasMore ? { hasMore: true, nextOffset: lastLine + 1 } : {}),
    ...(sheets?.length ? { sheets } : {}),
  };
}

/* ------------------------------- searching ------------------------------ */

/** Caps for a content search: bounded so a query cannot walk a disk or flood the context. */
const MAX_SEARCH_FILES = 2_000;
const MAX_HITS = 100;
const MAX_HIT_TEXT = 400;

/**
 * Fold case and strip accents, because «Facturación» and «facturacion» are the same word to the
 * person typing. Searching the raw bytes would also fail on every Office or PDF file — those are
 * archives, not text — which is why the search runs over the **extracted** text, the same
 * extraction a read does.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export type SearchResult = {
  hits: ContentHit[];
  scanned: number;
  skipped: number;
  hasMore: boolean;
  note?: string;
};

/**
 * Find a literal string **inside** the content of the granted files. The name-based search tells
 * you which file, never where inside it; this is the other half, and it pairs with a windowed
 * read: the hit gives the line number, the read gives the surrounding lines.
 */
export async function searchLocalContent(
  roots: string[],
  query: string,
  opts: { maxFiles?: number; maxHits?: number } = {},
): Promise<SearchResult> {
  const needle = foldForSearch((query ?? "").trim());
  if (!needle) return { hits: [], scanned: 0, skipped: 0, hasMore: false, note: "Búsqueda vacía." };
  const maxFiles = Math.max(1, Math.floor(opts.maxFiles ?? MAX_SEARCH_FILES));
  const maxHits = Math.max(1, Math.floor(opts.maxHits ?? MAX_HITS));
  const hits: ContentHit[] = [];
  let scanned = 0;
  let skipped = 0;
  let hasMore = false;
  for (const file of listLocalFiles(roots)) {
    if (scanned >= maxFiles || hits.length >= maxHits) {
      hasMore = true;
      break;
    }
    // An unreadable file (permissions, a broken archive) is not a failure of the search: it counts
    // as skipped and the loop keeps going.
    const extracted = await extractText(file.path).catch(() => null);
    scanned += 1;
    if (!extracted?.text) {
      skipped += 1;
      continue;
    }
    const lines = extracted.text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (!foldForSearch(line).includes(needle)) continue;
      hits.push({
        path: file.path,
        name: file.name,
        line: i + 1,
        text: line.trim().slice(0, MAX_HIT_TEXT),
      });
      if (hits.length >= maxHits) {
        hasMore = true;
        break;
      }
    }
  }
  return {
    hits,
    scanned,
    skipped,
    hasMore,
    ...(hasMore
      ? {
          note: "Hay más coincidencias de las que se devuelven. Acota la búsqueda, o elige un archivo de la lista y léelo por partes.",
        }
      : {}),
  };
}

/* ------------------------------- writing ------------------------------- */

export function writeLocalFile(target: string, roots: string[], content: string): LocalRead {
  const abs = resolveWithinRoots(target, roots);
  if (statSync(abs).isDirectory()) throw new Error("Eso es una carpeta, no un archivo.");
  writeFileSync(abs, content, "utf8");
  const st = statSync(abs);
  return {
    path: abs,
    name: basename(abs),
    size: st.size,
    modifiedTime: st.mtime.toISOString(),
    content: null,
  };
}

export function createLocalFile(
  folder: string,
  name: string,
  roots: string[],
  content: string,
): LocalRead {
  const dir = resolveWithinRoots(folder, roots);
  if (!statSync(dir).isDirectory()) throw new Error("La carpeta destino no existe.");
  const safeName = basename(name.trim());
  if (!safeName || safeName === "." || safeName === "..")
    throw new Error("Nombre de archivo no válido.");
  const abs = join(dir, safeName);
  if (existsSync(abs)) throw new Error(`Ya existe un archivo llamado "${safeName}".`);
  writeFileSync(abs, content, "utf8");
  const st = statSync(abs);
  return {
    path: abs,
    name: safeName,
    size: st.size,
    modifiedTime: st.mtime.toISOString(),
    content: null,
  };
}
