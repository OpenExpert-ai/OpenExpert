// SPDX-License-Identifier: MIT
// Server-only. Talks to Google Drive with the owner's OAuth token.
// All reads are restricted to the files the user explicitly granted via the
// Google Picker and stored in ~/.openexpert/drive-grants.json. Writes go to
// new files or to files the user previously picked.

import { getAccessToken } from "./drive-tokens.server";
import { logger } from "./logger.server";

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

async function call(path: string, query: Record<string, string> = {}) {
  const token = await getAccessToken();
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${DRIVE}${path}${qs ? `?${qs}` : ""}`, {
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
const FIELDS = "files(id,name,mimeType,modifiedTime,size,webViewLink),nextPageToken";

/** Restrict searches to the granted file IDs (Picker scope). */
export async function listFiles(
  search: string | null,
  grantedIds: string[],
  limit = 25,
): Promise<DriveFile[]> {
  if (grantedIds.length === 0) return [];
  const term = (search ?? "").replace(/['\\]/g, "");
  const idClause = grantedIds.map((id) => `'${id.replace(/'/g, "")}'`).join(" or ");
  const cleanQ = [
    "trashed = false",
    term ? `(name contains '${term}' or fullText contains '${term}')` : null,
    `(${idClause})`,
  ]
    .filter(Boolean)
    .join(" and ");
  const r = await call("/files", {
    q: cleanQ,
    fields: FIELDS,
    pageSize: String(limit),
    orderBy: search ? "" : "modifiedTime desc",
  });
  return ((await r.json()) as { files: DriveFile[] }).files ?? [];
}

/** Read only if the ID is in the granted set. */
export async function readFile(id: string, grantedIds: string[]) {
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
      fields: "id,name,mimeType,modifiedTime,webViewLink",
    })
  ).json()) as DriveFile;
  const exp = EXPORT[meta.mimeType];
  let text: string;
  if (exp)
    text = await (await call(`/files/${encodeURIComponent(id)}/export`, { mimeType: exp })).text();
  else if (meta.mimeType.startsWith("text/") || meta.mimeType === "application/json")
    text = await (await call(`/files/${encodeURIComponent(id)}`, { alt: "media" })).text();
  else if (meta.mimeType === "application/pdf") {
    const token = await getAccessToken();
    const buf = new Uint8Array(
      await (
        await fetch(`${DRIVE}/files/${encodeURIComponent(id)}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).arrayBuffer(),
    );
    if (buf.byteLength > 25_000_000)
      return { ...meta, content: null, note: "PDF demasiado grande (>25 MB) para leerlo." };
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const out = await extractText(pdf, { mergePages: true });
    text = String(out.text ?? "")
      .replace(/\s+\n/g, "\n")
      .trim();
    if (!text) return { ...meta, content: null, note: "PDF escaneado sin texto seleccionable." };
  } else return { ...meta, content: null, note: "Tipo de archivo no legible como texto." };
  return { ...meta, content: text.slice(0, 20000), truncated: text.length > 20000 };
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
  const res = await fetch(url, {
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
