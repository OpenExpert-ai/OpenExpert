// SPDX-License-Identifier: MIT
// Server-only. Talks to Google Drive with the owner's OAuth token.
// All reads are restricted to the files the user explicitly granted via the
// Google Picker and stored in ~/.openexpert/drive-grants.json. Writes go to
// new files or to files the user previously picked.

import { getAccessToken } from "./drive-tokens.server";
import { logger } from "./logger.server";
import { OFFICE_MIME, extractOfficeText } from "./office.server";
import { fetchWithTimeout } from "./http.server";
import { takeWindow } from "./text-window";
import { countPhrase } from "./translate";

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

/** A Drive request with a deadline: a host that accepts the connection and goes silent used
 *  to leave the chat streaming until the user pressed Stop. File transfers get longer. */
const driveFetch = (url: string, init: RequestInit = {}) =>
  fetchWithTimeout(url, init, { service: "Google Drive" });
const driveTransfer = (url: string, init: RequestInit = {}) =>
  fetchWithTimeout(url, init, { service: "Google Drive", timeoutMs: 60_000 });

/** The size ceiling for one Drive document, in bytes. A file over it is refused, never read:
 *  both the metadata check and the read below hold the same line. */
const MAX_DRIVE_BYTES = 25_000_000;

/** The ceiling as it reads in a note: `25 MB` beats `25000000 bytes` in the chat. */
const MAX_DRIVE_MB = Math.round(MAX_DRIVE_BYTES / 1_000_000);

const tooLarge = (what: string) => `${what} demasiado grande (>${MAX_DRIVE_MB} MB) para leerlo.`;

/**
 * Read a body up to `maxBytes`, cancelling the stream as soon as it goes over. `.text()` and
 * `.arrayBuffer()` buffer the whole document first: an 800 MB PDF reached memory before its size
 * was compared, and a text export had no ceiling at all. `Content-Length` is honoured first —
 * Google sends it — and the running byte count is the backstop for a body that under-reports it.
 */
async function readCapped(res: Response, maxBytes = MAX_DRIVE_BYTES) {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    if (res.body) await res.body.cancel().catch(() => {});
    return { bytes: null, over: true };
  }
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) return { bytes: null, over: true };
    return { bytes: buf, over: false };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { bytes: null, over: true };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return { bytes, over: false };
}

/** A body decoded as text, or `null` when it is over the ceiling. */
async function readText(res: Response) {
  const { bytes } = await readCapped(res);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

async function call(path: string, query: Record<string, string> = {}) {
  const token = await getAccessToken();
  const qs = new URLSearchParams(query).toString();
  const res = await driveFetch(`${DRIVE}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    logger.warn("drive.request_failed", { status: res.status, body: body.slice(0, 500) });
    throw new Error(`Google Drive respondió ${res.status}`);
  }
  return res;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
};

/**
 * Ceiling for one read as it reaches the model, in characters. It is not the file ceiling: a
 * document up to `MAX_DRIVE_BYTES` is readable, just not in a single answer.
 */
const READ_CHARS = 20_000;

/** Lines a read returns when the caller does not ask for a window. */
const DEFAULT_READ_LINES = 2_000;

/**
 * A read window, with the same meaning as the one in `read_local_file`: `offset` is a 1-based
 * line and `charOffset` the point inside that line where the previous read stopped. The properties
 * admit an explicit `undefined` because the tool layer forwards its optional arguments as-is, and
 * this project type-checks with `exactOptionalPropertyTypes`.
 */
export type DriveReadOptions = {
  offset?: number | undefined;
  limit?: number | undefined;
  charOffset?: number | undefined;
};

/** Read only if the ID is in the granted set. */
export async function readFile(id: string, grantedIds: string[], opts: DriveReadOptions = {}) {
  if (!grantedIds.includes(id)) {
    return {
      id,
      name: "(sin acceso)",
      mimeType: "application/octet-stream",
      modifiedTime: "",
      content: null,
      note: "OpenExpert solo tiene acceso a los archivos que elegiste con el Picker.",
    };
  }
  const meta = (await (
    await call(`/files/${encodeURIComponent(id)}`, {
      // `size` comes with the metadata so the decision is taken before the body: without it the
      // only way to know how heavy a PDF or an Office file was, was to download it whole.
      fields: "id,name,mimeType,modifiedTime,webViewLink,size",
    })
  ).json()) as DriveFile;
  // Google Docs, Sheets and Slides carry no `size` (they are not stored as one blob), so their
  // exports rely on the cap inside the read rather than on this check.
  const declared = Number(meta.size ?? "");
  if (Number.isFinite(declared) && declared > MAX_DRIVE_BYTES)
    return { ...meta, content: null, note: tooLarge("Archivo") };
  const exp = EXPORT[meta.mimeType];
  let text: string;
  if (exp) {
    const body = await readText(
      await call(`/files/${encodeURIComponent(id)}/export`, { mimeType: exp }),
    );
    if (body === null) return { ...meta, content: null, note: tooLarge("Documento") };
    text = body;
  } else if (meta.mimeType.startsWith("text/") || meta.mimeType === "application/json") {
    const body = await readText(await call(`/files/${encodeURIComponent(id)}`, { alt: "media" }));
    if (body === null) return { ...meta, content: null, note: tooLarge("Archivo") };
    text = body;
  } else if (meta.mimeType === "application/pdf") {
    const token = await getAccessToken();
    const body = await readCapped(
      await driveTransfer(`${DRIVE}/files/${encodeURIComponent(id)}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    if (!body.bytes) return { ...meta, content: null, note: tooLarge("PDF") };
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(body.bytes);
    const out = await extractText(pdf, { mergePages: true });
    text = String(out.text ?? "")
      .replace(/\s+\n/g, "\n")
      .trim();
    if (!text) return { ...meta, content: null, note: "PDF escaneado sin texto seleccionable." };
  } else if (OFFICE_MIME[meta.mimeType]) {
    const officeExt = OFFICE_MIME[meta.mimeType]!;
    const token = await getAccessToken();
    const body = await readCapped(
      await driveTransfer(`${DRIVE}/files/${encodeURIComponent(id)}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    if (!body.bytes) return { ...meta, content: null, note: tooLarge("Documento") };
    const r = await extractOfficeText(body.bytes, officeExt);
    if (!r.text) return { ...meta, content: null, note: r.note };
    text = r.text;
  } else return { ...meta, content: null, note: "Tipo de archivo no legible como texto." };
  // The text is returned in a **window of lines**, like a local file. Before, everything past
  // character 20.000 was unreachable: the model got `truncated: true` and no way to ask for the
  // rest, so a long Doc was answered with its first third and nothing said where it ended. The
  // cursor is the same one `read_local_file` hands out — `nextOffset`, plus `nextCharOffset` when
  // the cut fell inside a line — because a Sheet exported as CSV or a minified JSON is one line.
  const lines = text.split("\n");
  const totalLines = lines.length;
  const offset = Math.max(1, Math.floor(opts.offset ?? 1));
  const limit = Math.max(1, Math.floor(opts.limit ?? DEFAULT_READ_LINES));
  if (offset > totalLines) {
    return {
      ...meta,
      content: null,
      note: `El archivo tiene ${countPhrase(totalLines, "línea", "líneas")}: el offset ${offset} queda fuera del final. Usa un offset entre 1 y ${totalLines}.`,
    };
  }
  const wantedChar = Math.max(0, Math.floor(opts.charOffset ?? 0));
  const win = takeWindow(lines, offset, wantedChar, limit, READ_CHARS);
  return {
    ...meta,
    content: win.text,
    totalLines,
    totalChars: text.length,
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
  };
}

const EXPORT: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

export type DriveKind = "document" | "spreadsheet" | "text" | "markdown";
const TARGET: Record<DriveKind, { src: string; dst: string }> = {
  document: { src: "text/markdown", dst: "application/vnd.google-apps.document" },
  spreadsheet: { src: "text/csv", dst: "application/vnd.google-apps.spreadsheet" },
  text: { src: "text/plain", dst: "text/plain" },
  markdown: { src: "text/markdown", dst: "text/markdown" },
};

async function upload(
  method: "POST" | "PATCH",
  path: string,
  meta: Record<string, unknown>,
  content: string,
  srcMime: string,
) {
  const token = await getAccessToken();
  const boundary = "ee" + crypto.randomUUID().replace(/-/g, "");
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${srcMime}; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  const url = `${UPLOAD}${path}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink`;
  const res = await driveTransfer(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    logger.warn("drive.upload_failed", { status: res.status, body: t.slice(0, 500) });
    if (res.status === 403 || res.status === 404)
      throw new Error(
        `Google Drive no permite modificar este archivo (${res.status}). Solo puedes editar archivos que elegiste con el Picker o que OpenExpert creó.`,
      );
    throw new Error(`Google Drive respondió ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as DriveFile;
}

export async function createFile(
  name: string,
  content: string,
  kind: DriveKind,
  folderId?: string | null,
) {
  const t = TARGET[kind];
  return upload(
    "POST",
    "",
    { name, mimeType: t.dst, ...(folderId ? { parents: [folderId] } : {}) },
    content,
    t.src,
  );
}

export async function updateFile(
  id: string,
  content: string,
  grantedIds: string[],
  newName?: string | null,
) {
  if (!grantedIds.includes(id)) {
    throw new Error("No tienes permiso para editar este archivo (no está en tu selección).");
  }
  const meta = (await (
    await call(`/files/${encodeURIComponent(id)}`, { fields: "mimeType" })
  ).json()) as { mimeType: string };
  const src =
    meta.mimeType === "application/vnd.google-apps.spreadsheet"
      ? "text/csv"
      : meta.mimeType === "application/vnd.google-apps.document"
        ? "text/markdown"
        : meta.mimeType.startsWith("text/")
          ? meta.mimeType
          : "text/plain";
  return upload(
    "PATCH",
    `/${encodeURIComponent(id)}`,
    newName ? { name: newName } : {},
    content,
    src,
  );
}
