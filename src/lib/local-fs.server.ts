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

/** Names never listed or walked, to avoid leaking secrets and huge trees. */
const IGNORED = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  ".cache",
  ".local/share/Trash",
  "secret.key",
  "credentials.json",
  "drive-grants.json",
  "local-roots.json",
  "secrets.json",
  "openexpert.db",
]);

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
    if (IGNORED.has(e.name)) continue;
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
      if (IGNORED.has(e.name) || e.name.startsWith(".")) continue;
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
};

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

async function extractText(abs: string): Promise<{ text: string | null; note?: string }> {
  const size = statSync(abs).size;
  if (size > MAX_READ_BYTES)
    return { text: null, note: `Archivo demasiado grande (${size} bytes > 25 MB).` };
  const buf = readFileSync(abs);
  if (extname(abs).toLowerCase() === ".pdf") {
    const { extractText: extract, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const out = await extract(pdf, { mergePages: true });
    const text = String(out.text ?? "")
      .replace(/\s+\n/g, "\n")
      .trim();
    if (!text) return { text: null, note: "PDF escaneado sin texto seleccionable." };
    return { text };
  }
  const ext = extname(abs).toLowerCase();
  if (!TEXT_EXT.has(ext) && buf.subarray(0, 8000).includes(0))
    return { text: null, note: "Tipo de archivo no legible como texto." };
  return { text: buf.toString("utf8") };
}

export async function readLocalFile(target: string, roots: string[]): Promise<LocalRead> {
  const abs = resolveWithinRoots(target, roots);
  const st = statSync(abs);
  if (!st.isFile()) throw new Error("Eso no es un archivo.");
  const { text, note } = await extractText(abs);
  const truncated = !!text && text.length > MAX_CHARS;
  return {
    path: abs,
    name: basename(abs),
    size: st.size,
    modifiedTime: st.mtime.toISOString(),
    content: text ? text.slice(0, MAX_CHARS) : null,
    ...(truncated ? { truncated: true } : {}),
    ...(note ? { note } : {}),
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
