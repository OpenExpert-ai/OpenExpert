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

const dataSource = (id: string, title: string) => ({
  id,
  object: "data_source",
  title: [{ plain_text: title }],
  properties: { Name: { type: "title" }, Estado: { type: "status" } },
});

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

describe("notion.server", () => {
  it("searches and normalizes page and data source titles", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      json({ results: [page("p1", "Tarea pendiente"), dataSource("ds1", "Errores web")] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { search } = await import("./notion.server");
    const out = await search("errores");
    expect(out.items[0]).toEqual({
      id: "p1",
      object: "page",
      title: "Tarea pendiente",
      url: "https://notion.so/p1",
    });
    expect(out.items[1]).toMatchObject({ id: "ds1", object: "data_source", title: "Errores web" });
    expect(out.count).toBe(2);
    expect(out.hasMore).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.notion.com/v1/search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("follows has_more in a search and says how much it read", async () => {
    const sent: { start_cursor?: string; page_size?: number }[] = [];
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { start_cursor?: string; page_size?: number };
      sent.push(body);
      return body.start_cursor
        ? json({ results: [page("p2", "Segunda")], has_more: false })
        : json({
            results: [page("p1", "Primera")],
            has_more: true,
            next_cursor: "c1",
          });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { search } = await import("./notion.server");
    const out = await search("x");
    expect(out.items.map((i) => i.id)).toEqual(["p1", "p2"]);
    expect(out.count).toBe(2);
    expect(out.hasMore).toBe(false);
    expect(out.nextCursor).toBeUndefined();
    expect(sent.map((b) => b.start_cursor)).toEqual([undefined, "c1"]);
    expect(sent.every((b) => b.page_size === 100)).toBe(true);
  });

  it("stops at the page cap with the cursor of what is left", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { start_cursor?: string };
      const n = body.start_cursor ? Number(body.start_cursor.slice(1)) : 1;
      return json({
        results: [page(`p${n}a`, "A"), page(`p${n}b`, "B")],
        has_more: true,
        next_cursor: `c${n + 1}`,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { search } = await import("./notion.server");
    const out = await search("x");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(out.count).toBe(10);
    expect(out.hasMore).toBe(true);
    expect(out.nextCursor).toBe("c6");
  });

  it("queries a data source directly", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/data_sources/db1") && !init?.method)
        return json(dataSource("db1", "Tareas"));
      if (u.includes("/data_sources/db1/query")) return json({ results: [page("p2", "Otra")] });
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { queryDataSource } = await import("./notion.server");
    const out = await queryDataSource("db1", {
      filter: { property: "Estado", status: { equals: "Pendiente" } },
    });
    expect(out.items[0]!.title).toBe("Otra");
    expect(out.count).toBe(1);
    expect(out.hasMore).toBe(false);
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain("/data_sources/db1/query");
  });

  it("queries a data source with a cursor and reads the next page", async () => {
    const sent: { start_cursor?: string; page_size?: number }[] = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/data_sources/ds9") && !init?.method)
        return json(dataSource("ds9", "Tareas"));
      sent.push(JSON.parse(String(init?.body)) as { start_cursor?: string; page_size?: number });
      return json({ results: [page("p5", "Cinco")], has_more: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { queryDataSource } = await import("./notion.server");
    const out = await queryDataSource("ds9", { cursor: "c0", pageSize: 10 });
    expect(out.items[0]!.id).toBe("p5");
    expect(sent).toEqual([{ page_size: 10, start_cursor: "c0" }]);
  });

  it("resolves a database container id to its first data source", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/data_sources/db2")) return json({}, 404);
      if (u.endsWith("/databases/db2"))
        return json({
          object: "database",
          id: "db2",
          data_sources: [{ id: "ds2", name: "Tareas" }],
        });
      if (u.includes("/data_sources/ds2/query")) return json({ results: [page("p9", "Tarea 9")] });
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { queryDataSource } = await import("./notion.server");
    expect((await queryDataSource("db2")).items[0]!.id).toBe("p9");
  });

  it("describes a data source schema", async () => {
    const fetchMock = vi.fn(async (_url: string | URL) => json(dataSource("ds3", "Errores web")));
    vi.stubGlobal("fetch", fetchMock);
    const { describeDataSource } = await import("./notion.server");
    const d = await describeDataSource("ds3");
    expect(d.title).toBe("Errores web");
    expect(d.properties).toEqual([
      { name: "Name", type: "title" },
      { name: "Estado", type: "status" },
    ]);
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
    const out = await readPage("pg1");
    expect(out.content).toContain("- [ ] Comprar pan");
    expect(out.content).toContain("# Sección");
    expect(out.blocks).toBe(2);
    expect(out.hasMore).toBe(false);
  });

  it("reads a page to the block budget and says there is more", async () => {
    const blocks = (from: number) =>
      Array.from({ length: 100 }, (_, i) => ({
        id: `b${from + i}`,
        type: "paragraph",
        paragraph: { rich_text: [{ plain_text: `Línea ${from + i}` }] },
        has_children: false,
      }));
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      const from = Number(u.searchParams.get("start_cursor") ?? 0);
      return json({
        results: blocks(from),
        has_more: from + 100 < 400,
        next_cursor: String(from + 100),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { readPage } = await import("./notion.server");
    const out = await readPage("pg1");
    expect(out.blocks).toBe(300);
    expect(out.hasMore).toBe(true);
    expect(out.content.split("\n")).toHaveLength(300);
    expect(out.content.split("\n").at(-1)).toBe("Línea 299");
    // The fourth page is not requested: the budget stops the read, not the lack of blocks.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports a partial read when maxBlocks cuts a page short", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        results: [
          {
            id: "b1",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "Uno" }] },
            has_children: false,
          },
          {
            id: "b2",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "Dos" }] },
            has_children: false,
          },
        ],
        has_more: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { readPage } = await import("./notion.server");
    const out = await readPage("pg1", { maxBlocks: 1 });
    expect(out.blocks).toBe(1);
    expect(out.hasMore).toBe(true);
    expect(out.content).toBe("Uno");
  });

  it("creates a page under a data source parent", async () => {
    let sentParent: unknown;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/data_sources/ds1") && !init?.method)
        return json(dataSource("ds1", "Tareas"));
      if (u.endsWith("/pages") && init?.method === "POST") {
        sentParent = (JSON.parse(String(init.body)) as { parent: unknown }).parent;
        return json(page("new1", "Nueva"));
      }
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { createPage } = await import("./notion.server");
    const p = await createPage("ds1", { Name: {} });
    expect(p.title).toBe("Nueva");
    expect(sentParent).toEqual({ type: "data_source_id", data_source_id: "ds1" });
  });

  it("updates a page and appends blocks", async () => {
    const fetchMock = vi.fn(async () => json(page("p3", "Actualizada")));
    vi.stubGlobal("fetch", fetchMock);
    const { updatePage, appendBlocks } = await import("./notion.server");
    expect((await updatePage("p3", { Name: {} })).title).toBe("Actualizada");
    expect((await appendBlocks("p3", [])).id).toBe("p3");
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
