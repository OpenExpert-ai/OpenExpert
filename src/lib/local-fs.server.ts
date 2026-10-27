// SPDX-License-Identifier: MIT
// Local filesystem access for the single-owner edition.
//
// The browser cannot browse the disk, so the local server does it: it lists
// directories (names only) for the folder picker and reads/writes files only
// inside the folders the user explicitly granted. Every path is resolved with
// `realpath` and checked against the granted roots, which also defeats symlink
// escapes; creating a file never follows an entry that is already there, not
// even a dangling symlink.
//
// Limits are deliberately generous (local, single owner) but bounded so a
// prompt cannot make the model walk an entire disk.

import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { csvRecords, detectDelimiter } from "./csv-text";
import { OFFICE_EXT, extractOfficeText, type SheetInfo } from "./office.server";
import { takeWindow } from "./text-window";
import { countPhrase } from "./translate";

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

/** `5000` → «5.000», because the walk cap is quoted to the model and to the person reading it. */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** The walk cap written out, so the tools name it instead of hard-coding a second 5 000. */
export const MAX_WALK_FILES_TEXT = groupThousands(MAX_WALK_FILES);

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

/**
 * Whether a directory entry with that name exists, **following nothing**: `existsSync` follows the
 * link, so a symlink whose destination does not exist answers `false` and a write would follow it
 * and create the file at the other end. `lstat` looks at the entry itself, so a symlink counts
 * whether it dangles or not.
 */
function entryExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
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

/**
 * Directory listing for the picker. No file contents, only names.
 *
 * `entries` stops at `MAX_BROWSE_ENTRIES`, and the answer says so: `total` is
 * what the folder really has and `truncated` is `true` when the list stops
 * short. The cut is taken **after** sorting, because `readdirSync` returns
 * neither folders first nor names in order: cutting there is not deterministic
 * and can drop every subfolder, which is the only way to navigate to the rest.
 */
export function browseDirectory(path?: string | null): {
  path: string;
  parent: string | null;
  entries: DirEntry[];
  /** Every entry the folder has (ignored ones aside), not just the returned ones. */
  total: number;
  /** `true` when `entries` stops at `MAX_BROWSE_ENTRIES` with entries left out. */
  truncated: boolean;
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
  }
  entries.sort((a, b) =>
    a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1,
  );
  const total = entries.length;
  const truncated = total > MAX_BROWSE_ENTRIES;
  const parent = dirname(real);
  return {
    path: real,
    parent: parent === real ? null : parent,
    entries: truncated ? entries.slice(0, MAX_BROWSE_ENTRIES) : entries,
    total,
    truncated,
  };
}

/* ------------------------------ listing -------------------------------- */

/** What a walk returns: the files, and whether a cap cut it short. */
export type LocalWalk = {
  files: ListedFile[];
  /** `true` when the walk stopped at `maxFiles` or `maxDepth` with entries left unvisited. */
  truncated: boolean;
};

/**
 * Recursively list files under a granted folder, bounded in depth and count.
 *
 * The caps protect the caller (a mounted disk, a virtual `~` with thirty thousand files); they say
 * nothing about the folder. A walk that stopped early must say so, because `files.length` is then a
 * floor and not a count: reporting it as the folder size is how «el archivo no existe» was answered
 * with the file inside the folder.
 */
export function listLocalFiles(
  roots: string[],
  opts: { maxFiles?: number; maxDepth?: number } = {},
): LocalWalk {
  const maxFiles = Math.max(1, Math.floor(opts.maxFiles ?? MAX_WALK_FILES));
  const maxDepth = Math.max(0, Math.floor(opts.maxDepth ?? MAX_WALK_DEPTH));
  const out: ListedFile[] = [];
  let truncated = false;
  const seen = new Set<string>();
  const resolvedRoots = roots.map((r) => safeRealpath(r) ?? r);
  const insideRoots = (p: string) => resolvedRoots.some((r) => isWithin(r, p));
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) {
      // Subdirectories below this one exist — we were called to enter them — and stay unvisited.
      truncated = true;
      return;
    }
    if (out.length >= maxFiles) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= maxFiles) {
        truncated = true;
        return;
      }
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
  return { files: out, truncated };
}

/* ------------------------------- reading ------------------------------- */

export type LocalRead = {
  path: string;
  name: string;
  size: number;
  modifiedTime: string;
  content: string | null;
  /**
   * `true` when what is returned is not the whole file: the window hit the character cap, or the
   * scanned PDF's transcription was cut at its own ceiling (which `note` says).
   */
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
  /** Where the window started inside its first line, and where the next one resumes. */
  charOffset?: number;
  nextCharOffset?: number;
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
 * non-empty record, and the data rows are the rest — counting the header as data would inflate
 * every table by one row. The separator comes from the text, not from the extension; a file with
 * no separator at all is a single column.
 */
function csvStructure(text: string, name: string, fallback: string): SheetInfo {
  const records = csvRecords(text, detectDelimiter(text) ?? fallback);
  const header = (records[0] ?? []).map((cell) => cell.trim());
  return { name, rows: Math.max(0, records.length - 1), columns: header };
}

async function extractText(
  abs: string,
  opts: { vision?: boolean } = {},
): Promise<{ text: string | null; note?: string; sheets?: SheetInfo[]; truncated?: boolean }> {
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
    if (!text) {
      // A scanned PDF has no text layer: the pages are a photograph. Reading it with a model is a
      // cloud call carrying the document, so it happens **only** for an explicit read — never while
      // a bulk search walks a folder — and only when the owner turned it on.
      if (opts.vision) {
        const vision = await import("./vision-pdf.server");
        const seen = await vision.pdfTextWithVision(new Uint8Array(buf));
        // The transcription's own warning travels with the text: a cut transcription that arrives
        // without its note reads as the whole document, and the read below windows this text
        // (never the file), so `truncated` is the only thing that says the file goes on.
        if (seen.text)
          return {
            text: seen.text,
            ...(seen.note ? { note: seen.note } : {}),
            ...(seen.truncated ? { truncated: true } : {}),
          };
        if (seen.note) return { text: null, note: seen.note };
      }
      return { text: null, note: "PDF escaneado sin texto seleccionable." };
    }
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
export type ReadOptions = {
  offset?: number | undefined;
  limit?: number | undefined;
  /**
   * Character inside the line where the window starts (0-based). Only needed to continue a line
   * that did not fit in one read: `nextCharOffset` says where to resume.
   */
  charOffset?: number | undefined;
  /** Allow a scanned PDF to be read with a model. The caller decides: it is a cloud call. */
  vision?: boolean | undefined;
};

export async function readLocalFile(
  target: string,
  roots: string[],
  opts: ReadOptions = {},
): Promise<LocalRead> {
  const abs = resolveWithinRoots(target, roots);
  const st = statSync(abs);
  if (!st.isFile()) throw new Error("Eso no es un archivo.");
  const {
    text,
    note,
    sheets,
    truncated: cutSource,
  } = await extractText(abs, {
    vision: opts.vision === true,
  });
  const base: LocalRead = {
    path: abs,
    name: basename(abs),
    size: st.size,
    modifiedTime: st.mtime.toISOString(),
    content: null,
    ...(note ? { note } : {}),
    // A transcription that was cut at its ceiling is not the whole file, and this flag is the only
    // thing that says so: the window below counts lines of the transcription, so `totalLines` ends
    // where the transcription ends, not where the document does.
    ...(cutSource ? { truncated: true } : {}),
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
  if (offset > totalLines) {
    // Past the last line there is nothing to return, and an empty content with no reason reads as
    // an empty file: say what happened and where the file ends.
    return {
      ...base,
      totalLines,
      offset,
      limit,
      note: `El archivo tiene ${countPhrase(totalLines, "línea", "líneas")}: el offset ${offset} queda fuera del final. Usa un offset entre 1 y ${totalLines}.`,
    };
  }
  // The window is bounded by lines **and** by characters, and where it ends is one cursor: the
  // line (nextOffset) plus, when the cap cut through a line, the character inside it
  // (nextCharOffset). Without the second half a single line longer than the cap was unreachable
  // past the cut, which is the case this window exists for (a minified .js, a one-line .json).
  const wantedChar = Math.max(0, Math.floor(opts.charOffset ?? 0));
  const win = takeWindow(lines, offset, wantedChar, limit, MAX_CHARS);
  return {
    ...base,
    content: win.text,
    totalLines,
    offset,
    limit,
    ...(wantedChar > 0 ? { charOffset: wantedChar } : {}),
    ...(win.truncated ? { truncated: true } : {}),
    ...(win.more
      ? {
          hasMore: true,
          nextOffset: win.line,
          ...(win.char > 0 ? { nextCharOffset: win.char } : {}),
        }
      : {}),
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
  /** Files the walk listed but the file cap left unread. Absent when the search saw every file. */
  unscanned?: number;
  /** `true` when the folder walk itself stopped at its cap, so the listing is a floor. */
  truncated?: boolean;
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
  const walk = listLocalFiles(roots);
  const files = walk.files;
  const hits: ContentHit[] = [];
  let scanned = 0;
  let skipped = 0;
  // Two different reasons to stop, and they are not the same message: running out of hits means
  // «hay más coincidencias», running out of files means «no he mirado todo». The old code said the
  // first for both, so the model announced more hits when there were none and files left unread.
  for (const file of files) {
    if (hits.length >= maxHits) break;
    if (scanned >= maxFiles) break;
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
      if (hits.length >= maxHits) break;
    }
  }
  // The hit cap is reached and not passed (`hits.length` never exceeds it), so this is the flag —
  // setting it inside the loop missed the case where the last file filled the cap and the loop ended.
  const stoppedByHits = hits.length >= maxHits;
  const unscanned = files.length - scanned;
  const hasMore = stoppedByHits || unscanned > 0 || walk.truncated;
  const notes: string[] = [];
  if (stoppedByHits) {
    notes.push(
      "Hay más coincidencias de las que se devuelven. Acota la búsqueda, o elige un archivo de la lista y léelo por partes.",
    );
  } else if (unscanned > 0) {
    notes.push(
      `Se han revisado ${scanned} de ${files.length} archivos: ${
        unscanned === 1 ? "queda 1 sin revisar" : `quedan ${unscanned} sin revisar`
      }. Acota la búsqueda a una subcarpeta o usa un término más concreto.`,
    );
  }
  if (walk.truncated) {
    notes.push(
      `Además, el recorrido de la carpeta se ha cortado en el tope de ${MAX_WALK_FILES_TEXT} archivos, así que puede haber más sin listar.`,
    );
  }
  return {
    hits,
    scanned,
    skipped,
    hasMore,
    ...(unscanned > 0 ? { unscanned } : {}),
    ...(walk.truncated ? { truncated: true } : {}),
    ...(notes.length ? { note: notes.join(" ") } : {}),
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
  // Where the name leads, when it leads anywhere: `abs` is built from an already resolved folder,
  // so `realpath` on it follows a symlink and tells whether it points out of the granted roots. A
  // valid link that leaves them is refused for what it is, and a link that dangles does not resolve
  // at all, which the check below catches.
  const resolvedDest = safeRealpath(abs);
  const resolvedRoots = roots.map((r) => safeRealpath(r) ?? r);
  if (resolvedDest && !resolvedRoots.some((r) => isWithin(r, resolvedDest)))
    throw new Error("La ruta está fuera de las carpetas autorizadas.");
  // An entry with that name is a reason to refuse, and a symlink counts even when it dangles: the
  // write would follow it and land wherever it points, outside the folder the user granted.
  if (entryExists(abs)) throw new Error(`Ya existe un archivo llamado "${safeName}".`);
  // `wx` is the same refusal made atomic: it fails instead of following an entry that appeared
  // between the lines above, so the bytes cannot land outside the folder.
  try {
    writeFileSync(abs, content, { encoding: "utf8", flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`Ya existe un archivo llamado "${safeName}".`, { cause: e });
    throw e;
  }
  const st = statSync(abs);
  return {
    path: abs,
    name: safeName,
    size: st.size,
    modifiedTime: st.mtime.toISOString(),
    content: null,
  };
}
