// SPDX-License-Identifier: MIT
// Server-only. Talks to the real Google Drive API with the owner's OAuth token.

import { getAccessToken } from "./drive-tokens.server";

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
    console.error(`Drive [${res.status}]: ${body}`);
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

export async function listFiles(search: string | null, limit = 25): Promise<DriveFile[]> {
  const term = (search ?? "").replace(/['\\]/g, "");
  const q = [
    "trashed = false",
    term ? `(name contains '${term}' or fullText contains '${term}')` : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const r = await call("/files", {
    q,
    fields: FIELDS,
    pageSize: String(limit),
    orderBy: search ? "" : "modifiedTime desc",
  });
  return ((await r.json()) as { files: DriveFile[] }).files ?? [];
}

const KIND: Record<string, string> = {
  "application/vnd.google-apps.document": "Documentos",
  "application/vnd.google-apps.spreadsheet": "Hojas de cálculo",
  "application/vnd.google-apps.presentation": "Presentaciones",
  "application/vnd.google-apps.folder": "Carpetas",
  "application/pdf": "PDF",
};

/** Counts files by type (up to 5 pages) for the sources screen. */
export async function stats() {
  const counts: Record<string, number> = {};
  let token = "";
  for (let i = 0; i < 5; i++) {
    const r = await call("/files", {
      q: "trashed = false",
      fields: "files(mimeType),nextPageToken",
      pageSize: "1000",
      ...(token ? { pageToken: token } : {}),
    });
    const j = (await r.json()) as { files: { mimeType: string }[]; nextPageToken?: string };
    for (const f of j.files ?? []) {
      const k = KIND[f.mimeType] ?? "Otros archivos";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    if (!j.nextPageToken) break;
    token = j.nextPageToken;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

const EXPORT: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

export async function readFile(id: string) {
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
    console.error(`Drive upload [${res.status}]: ${t}`);
    if (res.status === 403 || res.status === 404)
      throw new Error(
        `Google Drive no permite modificar este archivo (${res.status}). Solo se pueden editar archivos creados por OpenExpert o requiere permiso completo de Drive.`,
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

export async function updateFile(id: string, content: string, newName?: string | null) {
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
