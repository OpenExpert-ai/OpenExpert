// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./notion-tokens.server", () => ({
  getNotionToken: () => "secret_token",
  NOTION_VERSION: "2026-03-11",
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const page = (id: string, title: string) => ({
  id,
  object: "page",
  url: `https://notion.so/${id}`,
  properties: { Name: { type: "title", title: [{ plain_text: title }] } },
});

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

describe("notion.server", () => {
  it("searches and normalizes titles", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      json({ results: [page("p1", "Tarea pendiente")] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { search } = await import("./notion.server");
    const out = await search("tarea");
    expect(out).toEqual([
      { id: "p1", object: "page", title: "Tarea pendiente", url: "https://notion.so/p1" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.notion.com/v1/search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("queries a database with a filter", async () => {
    const fetchMock = vi.fn(async (_url: string | URL) => json({ results: [page("p2", "Otra")] }));
    vi.stubGlobal("fetch", fetchMock);
    const { queryDatabase } = await import("./notion.server");
    const out = await queryDatabase("db1", {
      filter: { property: "Done", checkbox: { equals: false } },
    });
    expect(out[0]!.title).toBe("Otra");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/databases/db1/query");
  });

  it("reads a page as text, including to-dos", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        results: [
          {
            id: "b1",
            type: "to_do",
            to_do: { rich_text: [{ plain_text: "Comprar pan" }], checked: false },
            has_children: false,
          },
          {
            id: "b2",
            type: "heading_1",
            heading_1: { rich_text: [{ plain_text: "Sección" }] },
            has_children: false,
          },
        ],
        has_more: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { readPage } = await import("./notion.server");
    const text = await readPage("pg1");
    expect(text).toContain("- [ ] Comprar pan");
    expect(text).toContain("# Sección");
  });

  it("creates, updates and appends", async () => {
    const fetchMock = vi.fn(async () => json(page("p3", "Nueva")));
    vi.stubGlobal("fetch", fetchMock);
    const { createPage, updatePage, appendBlocks } = await import("./notion.server");
    expect((await createPage("db1", { Name: {} })).title).toBe("Nueva");
    expect((await updatePage("p3", { Name: {} })).title).toBe("Nueva");
    expect((await appendBlocks("p3", [])).id).toBe("p3");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps 429 and 401 to clear errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate", { status: 429 })),
    );
    const { search } = await import("./notion.server");
    await expect(search("x")).rejects.toThrow(/limitado/i);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unauth", { status: 401 })),
    );
    await expect(search("x")).rejects.toThrow(/válida/i);
  });
});
