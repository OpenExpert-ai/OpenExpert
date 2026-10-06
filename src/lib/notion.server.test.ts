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
    expect(out[0]).toEqual({
      id: "p1",
      object: "page",
      title: "Tarea pendiente",
      url: "https://notion.so/p1",
    });
    expect(out[1]).toMatchObject({ id: "ds1", object: "data_source", title: "Errores web" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.notion.com/v1/search",
      expect.objectContaining({ method: "POST" }),
    );
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
    expect(out[0]!.title).toBe("Otra");
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain("/data_sources/db1/query");
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
    expect((await queryDataSource("db2"))[0]!.id).toBe("p9");
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
    const text = await readPage("pg1");
    expect(text).toContain("- [ ] Comprar pan");
    expect(text).toContain("# Sección");
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
