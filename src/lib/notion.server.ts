// SPDX-License-Identifier: MIT
// Notion API client. Reads and writes only within what the user shared with the
// OpenExpert connection (Notion's own page picker enforces that). Server-only.

import { getNotionToken, NOTION_VERSION } from "./notion-tokens.server";
import { logger } from "./logger.server";

const API = "https://api.notion.com/v1";

type Json = Record<string, unknown>;

async function call(path: string, init: RequestInit = {}): Promise<Json> {
  const token = getNotionToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "notion-version": NOTION_VERSION,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    logger.warn("notion.request_failed", { status: res.status, body: body.slice(0, 500) });
    if (res.status === 429)
      throw new Error(
        "Notion ha limitado las peticiones; espera unos segundos e inténtalo de nuevo.",
      );
    if (res.status === 401)
      throw new Error("La conexión con Notion ya no es válida; vuelve a conectarla.");
    throw new Error(`Notion respondió ${res.status}`);
  }
  return (await res.json()) as Json;
}

/* ------------------------------- helpers -------------------------------- */

function plainText(rich: unknown): string {
  if (!Array.isArray(rich)) return "";
  return rich
    .map((r) => (r as { plain_text?: string }).plain_text ?? "")
    .join("")
    .trim();
}

/** Title of a Notion page or database object. */
export function notionTitle(obj: Json): string {
  if (obj["object"] === "database") return plainText(obj["title"]);
  const props = obj["properties"] as Json | undefined;
  if (props) {
    for (const value of Object.values(props)) {
      const p = value as Json;
      if (p["type"] === "title") return plainText(p["title"]);
    }
  }
  return "";
}

export type NotionItem = { id: string; object: string; title: string; url?: string };

function toItem(obj: Json): NotionItem {
  const item: NotionItem = {
    id: String(obj["id"] ?? ""),
    object: String(obj["object"] ?? ""),
    title: notionTitle(obj) || "(sin título)",
  };
  if (typeof obj["url"] === "string") item.url = obj["url"];
  return item;
}

function blockText(block: Json): string {
  const type = String(block["type"] ?? "");
  const payload = block[type] as Json | undefined;
  if (!payload) return "";
  if (type === "child_page") return `## ${String(payload["title"] ?? "")}`;
  const text = plainText(payload["rich_text"]);
  if (type === "to_do") return `- [${payload["checked"] ? "x" : " "}] ${text}`;
  if (type === "bulleted_list_item") return `- ${text}`;
  if (type === "numbered_list_item") return `1. ${text}`;
  if (type === "heading_1") return `# ${text}`;
  if (type === "heading_2") return `## ${text}`;
  if (type === "heading_3") return `### ${text}`;
  if (type === "quote") return `> ${text}`;
  if (type === "code") return text;
  return text;
}

/* -------------------------------- reads --------------------------------- */

export async function search(query: string, type?: "page" | "database"): Promise<NotionItem[]> {
  const body: Json = { query, page_size: 25 };
  if (type) body["filter"] = { property: "object", value: type };
  const data = await call("/search", { method: "POST", body: JSON.stringify(body) });
  return ((data["results"] ?? []) as Json[]).map(toItem);
}

export async function queryDatabase(
  databaseId: string,
  opts: { filter?: unknown; sorts?: unknown; pageSize?: number } = {},
): Promise<NotionItem[]> {
  const body: Json = { page_size: Math.min(opts.pageSize ?? 50, 100) };
  if (opts.filter) body["filter"] = opts.filter;
  if (opts.sorts) body["sorts"] = opts.sorts;
  const data = await call(`/databases/${encodeURIComponent(databaseId)}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return ((data["results"] ?? []) as Json[]).map(toItem);
}

/** Read a page's text, following one level of nested blocks, bounded. */
export async function readPage(pageId: string, maxBlocks = 300): Promise<string> {
  const lines: string[] = [];
  let count = 0;

  async function walk(blockId: string, depth: number): Promise<void> {
    if (depth > 2 || count >= maxBlocks) return;
    let cursor: string | undefined;
    do {
      const q = new URLSearchParams({ page_size: "100" });
      if (cursor) q.set("start_cursor", cursor);
      const data = await call(`/blocks/${encodeURIComponent(blockId)}/children?${q}`);
      const results = (data["results"] ?? []) as Json[];
      for (const b of results) {
        if (count >= maxBlocks) break;
        count++;
        const text = blockText(b);
        if (text) lines.push(text);
        if (b["has_children"] && depth < 2) await walk(String(b["id"]), depth + 1);
      }
      cursor = data["has_more"] ? String(data["next_cursor"]) : undefined;
    } while (cursor && count < maxBlocks);
  }

  await walk(pageId, 0);
  return lines.join("\n");
}

/* -------------------------------- writes -------------------------------- */

export async function createPage(databaseId: string, properties: Json): Promise<NotionItem> {
  const data = await call("/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
  });
  return toItem(data);
}

export async function updatePage(pageId: string, properties: Json): Promise<NotionItem> {
  const data = await call(`/pages/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
  return toItem(data);
}

export async function appendBlocks(pageId: string, children: unknown[]): Promise<NotionItem> {
  await call(`/blocks/${encodeURIComponent(pageId)}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children }),
  });
  return { id: pageId, object: "block", title: "(bloques añadidos)" };
}
