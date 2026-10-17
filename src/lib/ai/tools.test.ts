// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-tools-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

async function buildTools() {
  const { createChatTools } = await import("./tools");
  return createChatTools({
    expert: { name: "General", sources: ["gdrive", "local"] },
    expertId: "general",
    used: new Set<string>(),
    allowed: () => true,
    proposePending: async (_domain, title, risk, items) => ({
      eventId: "evt_test",
      title,
      risk,
      items,
      status: "pending" as const,
    }),
  });
}

type Parser = { parse: (v: unknown) => unknown };

describe("tolerant tool inputs", () => {
  it("coerces a numeric string and allows the filter to be omitted", async () => {
    const tools = await buildTools();
    const schema = tools.list_overdue_invoices.inputSchema as unknown as Parser;
    expect(schema.parse({ minAmount: "0" })).toEqual({ minAmount: 0 });
    expect(schema.parse({})).toEqual({ minAmount: undefined });
    expect(schema.parse({ minAmount: null })).toEqual({ minAmount: null });
  });

  it("accepts a single id string where an array is expected", async () => {
    const tools = await buildTools();
    const schema = tools.propose_invoice_reminders.inputSchema as unknown as Parser;
    expect(schema.parse({ invoiceIds: "inv-1" })).toEqual({ invoiceIds: "inv-1" });
  });
});

describe("provenance", () => {
  it("reports no connected source and no invented data", async () => {
    const tools = await buildTools();
    const exec = (
      tools.get_pipeline_summary as unknown as {
        execute: (input: unknown) => Promise<Record<string, unknown>>;
      }
    ).execute;
    const out = await exec({});
    expect(out["connected"]).toBe(false);
    expect(out["source"]).toBe("sin conexión");
    expect(typeof out["note"]).toBe("string");
    expect(out["openValue"]).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

type Executable = { execute: (input: unknown) => Promise<Record<string, unknown>> };
const exec = (t: unknown) => (t as Executable).execute;

/** Tools wired to an Expert with a given domain/source allow-list. */
async function buildExpert(domains: string[] = [], sources: string[] = []) {
  const { createChatTools } = await import("./tools");
  const used = new Set<string>();
  const proposals: { domain: string; title: string }[] = [];
  const tools = createChatTools({
    expert: { name: "Experto de prueba", sources },
    expertId: "experto-test",
    used,
    allowed: (domain) => domains.includes(domain),
    proposePending: async (domain, title, risk, items) => {
      proposals.push({ domain, title });
      return { eventId: "evt_test", title, risk, items, status: "pending" as const };
    },
  });
  return { tools, used, proposals };
}

describe("per-Expert domain isolation", () => {
  it("returns no data for a domain the Expert does not own", async () => {
    const { tools, used } = await buildExpert(["ventas"]);
    for (const tool of [
      tools.list_overdue_invoices,
      tools.get_campaign_performance,
      tools.get_churn_risk,
    ]) {
      const out = await exec(tool)({});
      expect(String(out["error"])).toMatch(/Fuera de contexto/);
    }
    const overdue = await exec(tools.list_overdue_invoices)({});
    expect(overdue["invoices"]).toBeUndefined();
    // A refused read must not be labelled as a source the Expert used.
    expect(used.has("Facturación")).toBe(false);
    expect(used.has("Publicidad")).toBe(false);
    expect(used.has("Clientes")).toBe(false);
  });

  it("returns data for an owned domain, but only there", async () => {
    const { tools, used } = await buildExpert(["finanzas"]);
    const invoices = await exec(tools.list_overdue_invoices)({});
    expect(Array.isArray(invoices["invoices"])).toBe(true);
    expect(used.has("Facturación")).toBe(true);

    const deals = await exec(tools.list_deals)({});
    expect(String(deals["error"])).toMatch(/Fuera de contexto/);
    expect(deals["deals"]).toBeUndefined();
  });

  it("does not even propose a write outside the owned domains", async () => {
    const { tools, proposals } = await buildExpert(["ventas"]);
    const out = await exec(tools.propose_invoice_reminders)({ invoiceIds: "inv-1" });
    expect(String(out["error"])).toMatch(/Fuera de contexto/);
    expect(proposals).toHaveLength(0);
  });

  it("proposes with pending status inside the owned domains", async () => {
    const { getDb, persist } = await import("../db.server");
    const { raw } = await getDb();
    raw.run(
      "INSERT OR REPLACE INTO integrations (id,name,category,connected,entities) VALUES (?,?,?,?,?)",
      ["holded", "Holded", "finanzas", 1, "[]"],
    );
    raw.run(
      "INSERT OR REPLACE INTO invoices (id,client,amount,due_date,status,reminders) VALUES (?,?,?,?,?,?)",
      ["inv-test", "Cliente Uno", 1200, "2026-01-01", "overdue", 0],
    );
    await persist();

    const { tools, proposals } = await buildExpert(["finanzas"]);
    const out = await exec(tools.propose_invoice_reminders)({ invoiceIds: ["inv-test"] });
    expect(out["status"]).toBe("pending");
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.domain).toBe("finanzas");
    expect(proposals[0]?.title).toMatch(/^Enviar 1 /);
  });
});

describe("source isolation", () => {
  it("denies a source the Expert does not list", async () => {
    const { tools, used } = await buildExpert(["ventas"], []);
    for (const [tool, input] of [
      [tools.search_drive, { query: "informe" }],
      [tools.list_local_files, {}],
      [tools.search_notion, { query: "informe" }],
    ] as const) {
      const out = await exec(tool)(input);
      expect(String(out["error"])).toMatch(/Fuera de contexto/);
    }
    expect(used.size).toBe(0);
  });

  it("reaches a listed source and labels it", async () => {
    const { tools, used } = await buildExpert(["ventas"], ["local"]);
    const out = await exec(tools.list_local_files)({});
    expect(Array.isArray(out["files"])).toBe(true);
    expect(used.has("Archivos locales")).toBe(true);

    const notion = await exec(tools.search_notion)({ query: "informe" });
    expect(String(notion["error"])).toMatch(/Fuera de contexto/);
  });
});

/* -------------------------------------------------------------------------- */
/* Handlers isolated from their service layer (no network, no credentials)    */
/* -------------------------------------------------------------------------- */

const svc = vi.hoisted(() => ({
  notionSearch: vi.fn(),
  notionQuery: vi.fn(),
  notionDescribe: vi.fn(),
  notionRead: vi.fn(),
  notionCreate: vi.fn(),
  notionUpdate: vi.fn(),
  notionAppend: vi.fn(),
  driveRead: vi.fn(),
  driveCreate: vi.fn(),
  driveUpdate: vi.fn(),
  loadGrantedFiles: vi.fn(() => [] as { id: string; name: string; mimeType: string }[]),
  loadLocalRoots: vi.fn(() => [] as { path: string; name: string }[]),
  listLocalFiles: vi.fn(() => [] as { path: string; name: string; size: number }[]),
  readLocalFile: vi.fn(),
  searchLocalContent: vi.fn(
    () =>
      ({ hits: [], scanned: 0, skipped: 0, hasMore: false }) as {
        hits: { path: string; name: string; line: number; text: string }[];
        scanned: number;
        skipped: number;
        hasMore: boolean;
      },
  ),
  createLocalFile: vi.fn(),
  writeLocalFile: vi.fn(),
}));

vi.mock("../notion.server", () => ({
  search: svc.notionSearch,
  queryDataSource: svc.notionQuery,
  describeDataSource: svc.notionDescribe,
  readPage: svc.notionRead,
  createPage: svc.notionCreate,
  updatePage: svc.notionUpdate,
  appendBlocks: svc.notionAppend,
}));
vi.mock("../drive.server", () => ({
  readFile: svc.driveRead,
  createFile: svc.driveCreate,
  updateFile: svc.driveUpdate,
}));
vi.mock("../opencore/local-secrets.server", () => ({
  loadGrantedFiles: svc.loadGrantedFiles,
  loadLocalRoots: svc.loadLocalRoots,
}));
vi.mock("../local-fs.server", () => ({
  listLocalFiles: svc.listLocalFiles,
  readLocalFile: svc.readLocalFile,
  searchLocalContent: svc.searchLocalContent,
  createLocalFile: svc.createLocalFile,
  writeLocalFile: svc.writeLocalFile,
}));

beforeEach(() => {
  vi.clearAllMocks();
  svc.loadGrantedFiles.mockReturnValue([]);
  svc.loadLocalRoots.mockReturnValue([]);
  svc.listLocalFiles.mockReturnValue([]);
});

const FsFile = { path: "/r/a.txt", name: "a.txt", size: 4 };

describe("business tools with a connected source", () => {
  it("labels the real integration name and drops the no-source note", async () => {
    const { getDb, persist } = await import("../db.server");
    const { raw } = await getDb();
    raw.run(
      "INSERT OR REPLACE INTO integrations (id,name,category,connected,entities) VALUES (?,?,?,?,?)",
      ["pipedrive", "Pipedrive", "ventas", 1, "[]"],
    );
    await persist();

    const { tools } = await buildExpert(["ventas"]);
    const out = await exec(tools.get_pipeline_summary)({});
    expect(out["connected"]).toBe(true);
    expect(out["source"]).toBe("Pipedrive");
    expect(out["note"]).toBeUndefined();
  });

  it("executes every business read handler for an Expert that owns the domains", async () => {
    const { getDb, persist } = await import("../db.server");
    const { raw } = await getDb();
    raw.run(
      "INSERT OR REPLACE INTO deals (id,company,stage,value,owner,days_in_stage,status) VALUES (?,?,?,?,?,?,?)",
      ["d1", "Acme", "Demo", 1000, "Ana", 30, "open"],
    );
    raw.run(
      "INSERT OR REPLACE INTO deals (id,company,stage,value,owner,days_in_stage,status) VALUES (?,?,?,?,?,?,?)",
      ["d2", "Beta", "Propuesta", 500, "Luis", 5, "open"],
    );
    raw.run(
      "INSERT OR REPLACE INTO invoices (id,client,amount,due_date,status,reminders) VALUES (?,?,?,?,?,?)",
      ["i2", "Cliente Dos", 50, "2000-01-01", "overdue", 0],
    );
    await persist();

    const { tools } = await buildExpert(["ventas", "finanzas", "marketing", "clientes"]);
    const deals = await exec(tools.list_deals)({ stage: "demo" });
    // Case-insensitive stage match, and only the open deal in that stage.
    expect((deals["deals"] as { company: string }[]).map((d) => d.company)).toEqual(["Acme"]);

    const invoices = await exec(tools.list_overdue_invoices)({ minAmount: 1000 });
    // Only the earlier 1200€ invoice clears the threshold; the 50€ one is dropped.
    expect((invoices["invoices"] as { id: string }[]).map((i) => i.id)).toEqual(["inv-test"]);

    const campaigns = await exec(tools.get_campaign_performance)({});
    expect(Array.isArray(campaigns["campaigns"])).toBe(true);

    const churn = await exec(tools.get_churn_risk)({});
    expect(Array.isArray(churn["accounts"])).toBe(true);
  });
});

describe("open_expert_form", () => {
  it("echoes the suggested values back as a form proposal", async () => {
    const { tools } = await buildExpert([]);
    const out = await exec(tools.open_expert_form)({
      suggestedName: "Marketing",
      suggestedDescription: "Campañas y CPA",
    });
    expect(out).toEqual({
      form: true,
      suggestedName: "Marketing",
      suggestedDescription: "Campañas y CPA",
    });
  });
});

describe("propose_pause_campaigns", () => {
  it("refuses outside the marketing domain without proposing", async () => {
    const { tools, proposals } = await buildExpert(["ventas"]);
    const out = await exec(tools.propose_pause_campaigns)({ campaignIds: "c1" });
    expect(String(out["error"])).toMatch(/Fuera de contexto/);
    expect(proposals).toHaveLength(0);
  });

  it("reports it has no connected advertising source", async () => {
    const { tools } = await buildExpert(["marketing"]);
    const out = await exec(tools.propose_pause_campaigns)({ campaignIds: "c1" });
    expect(String(out["error"])).toContain("No hay ninguna fuente");
  });

  it("errors when no active campaign matches the ids", async () => {
    const { getDb, persist } = await import("../db.server");
    const { raw } = await getDb();
    raw.run(
      "INSERT OR REPLACE INTO integrations (id,name,category,connected,entities) VALUES (?,?,?,?,?)",
      ["meta", "Meta", "marketing", 1, "[]"],
    );
    raw.run(
      "INSERT OR REPLACE INTO campaigns (id,name,channel,status,spend_7d,conversions_7d,cpa_target,daily_budget) VALUES (?,?,?,?,?,?,?,?)",
      ["c-paused", "Antigua", "meta", "paused", 100, 10, 10, 5],
    );
    await persist();

    const { tools, proposals } = await buildExpert(["marketing"]);
    const out = await exec(tools.propose_pause_campaigns)({ campaignIds: ["c-paused"] });
    expect(String(out["error"])).toMatch(/No hay campañas activas/);
    expect(proposals).toHaveLength(0);
  });

  it("proposes pausing matching active campaigns", async () => {
    const { getDb, persist } = await import("../db.server");
    const { raw } = await getDb();
    raw.run(
      "INSERT OR REPLACE INTO integrations (id,name,category,connected,entities) VALUES (?,?,?,?,?)",
      ["meta", "Meta", "marketing", 1, "[]"],
    );
    raw.run(
      "INSERT OR REPLACE INTO campaigns (id,name,channel,status,spend_7d,conversions_7d,cpa_target,daily_budget) VALUES (?,?,?,?,?,?,?,?)",
      ["c-1", "Verano", "meta", "active", 1000, 50, 10, 20],
    );
    await persist();

    const { tools, proposals } = await buildExpert(["marketing"]);
    const out = await exec(tools.propose_pause_campaigns)({ campaignIds: ["c-1"] });
    expect(out["status"]).toBe("pending");
    expect(proposals[0]?.title).toMatch(/^Pausar 1 /);
    expect((out["items"] as string[])[0]).toContain("Verano");
    expect((out["items"] as string[])[0]).toContain("CPA 20€");
  });

  it("says a campaign has no conversions instead of printing a null CPA", async () => {
    const { getDb, persist } = await import("../db.server");
    const { raw } = await getDb();
    raw.run(
      "INSERT OR REPLACE INTO integrations (id,name,category,connected,entities) VALUES (?,?,?,?,?)",
      ["meta", "Meta", "marketing", 1, "[]"],
    );
    raw.run(
      "INSERT OR REPLACE INTO campaigns (id,name,channel,status,spend_7d,conversions_7d,cpa_target,daily_budget) VALUES (?,?,?,?,?,?,?,?)",
      ["c-0", "Marca", "meta", "active", 500, 0, 10, 20],
    );
    await persist();

    const { tools, proposals } = await buildExpert(["marketing"]);
    const out = await exec(tools.propose_pause_campaigns)({ campaignIds: ["c-0"] });
    expect(out["status"]).toBe("pending");
    const item = (out["items"] as string[])[0] ?? "";
    expect(item).toContain("Marca");
    expect(item).toContain("sin conversiones");
    expect(item).not.toContain("null");
    expect(proposals).toHaveLength(1);
  });
});

describe("Google Drive tools", () => {
  it("denies when the Expert does not list the gdrive source", async () => {
    const { tools } = await buildExpert([], ["local"]);
    const out = await exec(tools.search_drive)({ query: "x" });
    expect(String(out["error"])).toMatch(/Fuera de contexto/);
    expect(svc.loadGrantedFiles).not.toHaveBeenCalled();
  });

  it("search_drive filters the Picker grants by name", async () => {
    svc.loadGrantedFiles.mockReturnValue([
      { id: "f1", name: "Informe Q1", mimeType: "application/pdf" },
      { id: "f2", name: "Notas", mimeType: "text/plain" },
    ]);
    const { tools, used } = await buildExpert([], ["gdrive"]);
    const out = await exec(tools.search_drive)({ query: "informe" });
    expect(out["files"]).toEqual([{ id: "f1", name: "Informe Q1", mimeType: "application/pdf" }]);
    expect(out["note"]).toBeUndefined();
    expect(used.has("Google Drive")).toBe(true);
  });

  it("search_drive notes when nothing matches the query", async () => {
    svc.loadGrantedFiles.mockReturnValue([{ id: "f1", name: "Notas", mimeType: "text/plain" }]);
    const { tools } = await buildExpert([], ["gdrive"]);
    const out = await exec(tools.search_drive)({ query: "zzz" });
    expect(out["files"]).toEqual([]);
    expect(String(out["note"])).toMatch(/No hay archivos/);
  });

  it("search_drive surfaces an unreadable-grants error", async () => {
    svc.loadGrantedFiles.mockImplementation(() => {
      throw new Error("No se pudo leer drive-grants.json");
    });
    const { tools } = await buildExpert([], ["gdrive"]);
    const out = await exec(tools.search_drive)({ query: "x" });
    expect(out["error"]).toBe("No se pudo leer drive-grants.json");
  });

  it("read_drive_file delegates to drive.server with the granted ids", async () => {
    svc.loadGrantedFiles.mockReturnValue([{ id: "f1", name: "x", mimeType: "text/plain" }]);
    svc.driveRead.mockResolvedValue({ id: "f1", content: "hola", truncated: false });
    const { tools } = await buildExpert([], ["gdrive"]);
    const out = await exec(tools.read_drive_file)({ fileId: "f1" });
    expect(out["content"]).toBe("hola");
    expect(svc.driveRead).toHaveBeenCalledWith("f1", ["f1"]);
  });

  it("read_drive_file surfaces a service error", async () => {
    svc.driveRead.mockRejectedValue(new Error("sin tokens de Drive"));
    const { tools } = await buildExpert([], ["gdrive"]);
    const out = await exec(tools.read_drive_file)({ fileId: "f1" });
    expect(out["error"]).toBe("sin tokens de Drive");
  });

  it("create_drive_file creates the file and audits it", async () => {
    svc.driveCreate.mockResolvedValue({
      id: "new",
      name: "Doc",
      mimeType: "text/markdown",
      modifiedTime: "t",
      webViewLink: "u",
    });
    const { tools } = await buildExpert([], ["gdrive"]);
    const out = await exec(tools.create_drive_file)({
      name: "Doc",
      content: "cuerpo",
      kind: "markdown",
      folderId: "fld",
    });
    expect(out["action"]).toBe("created");
    expect(out["id"]).toBe("new");
    expect(svc.driveCreate).toHaveBeenCalledWith("Doc", "cuerpo", "markdown", "fld");
  });

  it("create_drive_file surfaces a permission error", async () => {
    svc.driveCreate.mockRejectedValue(
      new Error("Google Drive no permite modificar este archivo (403)."),
    );
    const { tools } = await buildExpert([], ["gdrive"]);
    const out = await exec(tools.create_drive_file)({
      name: "Doc",
      content: "x",
      kind: "document",
    });
    expect(String(out["error"])).toMatch(/403/);
  });

  it("update_drive_file rewrites the file with the granted ids", async () => {
    svc.loadGrantedFiles.mockReturnValue([{ id: "f1", name: "x", mimeType: "text/plain" }]);
    svc.driveUpdate.mockResolvedValue({
      id: "f1",
      name: "Nuevo",
      mimeType: "text/plain",
      modifiedTime: "t",
    });
    const { tools } = await buildExpert([], ["gdrive"]);
    const out = await exec(tools.update_drive_file)({
      fileId: "f1",
      content: "nuevo",
      newName: "Nuevo",
    });
    expect(out["action"]).toBe("updated");
    expect(svc.driveUpdate).toHaveBeenCalledWith("f1", "nuevo", ["f1"], "Nuevo");
  });

  it("update_drive_file surfaces a permission error", async () => {
    svc.loadGrantedFiles.mockReturnValue([]);
    svc.driveUpdate.mockRejectedValue(new Error("no está en tu selección"));
    const { tools } = await buildExpert([], ["gdrive"]);
    const out = await exec(tools.update_drive_file)({ fileId: "f1", content: "x" });
    expect(String(out["error"])).toMatch(/selección/);
  });
});

describe("local file tools", () => {
  it("list_local_files returns the granted roots and the listed files", async () => {
    svc.loadLocalRoots.mockReturnValue([{ path: "/home/u/docs", name: "docs" }]);
    svc.listLocalFiles.mockReturnValue([FsFile]);
    const { tools, used } = await buildExpert([], ["local"]);
    const out = await exec(tools.list_local_files)({});
    expect(out["roots"]).toEqual(["/home/u/docs"]);
    expect(out["files"]).toEqual([FsFile]);
    expect(svc.listLocalFiles).toHaveBeenCalledWith(["/home/u/docs"]);
    expect(used.has("Archivos locales")).toBe(true);
  });

  it("list_local_files surfaces a filesystem error", async () => {
    svc.loadLocalRoots.mockReturnValue([{ path: "/x", name: "x" }]);
    svc.listLocalFiles.mockImplementation(() => {
      throw new Error("EACCES");
    });
    const { tools } = await buildExpert([], ["local"]);
    const out = await exec(tools.list_local_files)({});
    expect(out["error"]).toBe("EACCES");
  });

  it("search_local_files filters by name, case-insensitively", async () => {
    svc.loadLocalRoots.mockReturnValue([{ path: "/r", name: "r" }]);
    svc.listLocalFiles.mockReturnValue([
      { path: "/r/Informe.md", name: "Informe.md", size: 10 },
      { path: "/r/otro.txt", name: "otro.txt", size: 5 },
    ]);
    const { tools } = await buildExpert([], ["local"]);
    const out = await exec(tools.search_local_files)({ query: "informe" });
    expect(out["files"]).toEqual([{ path: "/r/Informe.md", name: "Informe.md", size: 10 }]);
  });

  it("search_local_files surfaces a filesystem error", async () => {
    svc.loadLocalRoots.mockReturnValue([{ path: "/r", name: "r" }]);
    svc.listLocalFiles.mockImplementation(() => {
      throw new Error("EACCES");
    });
    const { tools } = await buildExpert([], ["local"]);
    const out = await exec(tools.search_local_files)({ query: "x" });
    expect(out["error"]).toBe("EACCES");
  });

  it("read_local_file reads inside the granted roots", async () => {
    svc.loadLocalRoots.mockReturnValue([{ path: "/r", name: "r" }]);
    svc.readLocalFile.mockResolvedValue({
      path: "/r/a.txt",
      name: "a.txt",
      size: 4,
      modifiedTime: "t",
      content: "hola",
    });
    const { tools } = await buildExpert([], ["local"]);
    const out = await exec(tools.read_local_file)({ path: "/r/a.txt" });
    expect(out["content"]).toBe("hola");
    expect(svc.readLocalFile).toHaveBeenCalledWith("/r/a.txt", ["/r"]);
  });

  it("read_local_file rejects a path outside the roots", async () => {
    svc.loadLocalRoots.mockReturnValue([{ path: "/r", name: "r" }]);
    svc.readLocalFile.mockRejectedValue(
      new Error("La ruta está fuera de las carpetas autorizadas."),
    );
    const { tools } = await buildExpert([], ["local"]);
    const out = await exec(tools.read_local_file)({ path: "/etc/passwd" });
    expect(String(out["error"])).toMatch(/fuera de las carpetas/);
  });

  it("create_local_file writes the new file and audits it", async () => {
    svc.loadLocalRoots.mockReturnValue([{ path: "/r", name: "r" }]);
    svc.createLocalFile.mockReturnValue({
      path: "/r/n.txt",
      name: "n.txt",
      size: 1,
      modifiedTime: "t",
      content: null,
    });
    const { tools } = await buildExpert([], ["local"]);
    const out = await exec(tools.create_local_file)({ folder: "/r", name: "n.txt", content: "x" });
    expect(out["action"]).toBe("created");
    expect(svc.createLocalFile).toHaveBeenCalledWith("/r", "n.txt", ["/r"], "x");
  });

  it("create_local_file refuses to overwrite an existing file", async () => {
    svc.loadLocalRoots.mockReturnValue([{ path: "/r", name: "r" }]);
    svc.createLocalFile.mockImplementation(() => {
      throw new Error('Ya existe un archivo llamado "n.txt".');
    });
    const { tools } = await buildExpert([], ["local"]);
    const out = await exec(tools.create_local_file)({ folder: "/r", name: "n.txt", content: "x" });
    expect(String(out["error"])).toMatch(/Ya existe/);
  });

  it("update_local_file rewrites an existing file and audits it", async () => {
    svc.loadLocalRoots.mockReturnValue([{ path: "/r", name: "r" }]);
    svc.writeLocalFile.mockReturnValue({
      path: "/r/a.txt",
      name: "a.txt",
      size: 2,
      modifiedTime: "t",
      content: null,
    });
    const { tools } = await buildExpert([], ["local"]);
    const out = await exec(tools.update_local_file)({ path: "/r/a.txt", content: "nuevo" });
    expect(out["action"]).toBe("updated");
    expect(svc.writeLocalFile).toHaveBeenCalledWith("/r/a.txt", ["/r"], "nuevo");
  });

  it("update_local_file surfaces the no-roots error", async () => {
    svc.writeLocalFile.mockImplementation(() => {
      throw new Error("No hay ninguna carpeta local autorizada.");
    });
    const { tools } = await buildExpert([], ["local"]);
    const out = await exec(tools.update_local_file)({ path: "/r/a.txt", content: "x" });
    expect(String(out["error"])).toMatch(/No hay ninguna carpeta/);
  });
});

describe("Notion tools", () => {
  const item = { id: "p1", object: "page", title: "Tarea", url: "https://notion/p1" };

  it("search_notion forwards the type filter and labels the source", async () => {
    svc.notionSearch.mockResolvedValue([item]);
    const { tools, used } = await buildExpert([], ["notion"]);
    const out = await exec(tools.search_notion)({ query: "tarea", type: "page" });
    expect(out["results"]).toEqual([item]);
    expect(svc.notionSearch).toHaveBeenCalledWith("tarea", "page");
    expect(used.has("Notion")).toBe(true);
  });

  it("search_notion without a type passes undefined", async () => {
    svc.notionSearch.mockResolvedValue([]);
    const { tools } = await buildExpert([], ["notion"]);
    await exec(tools.search_notion)({ query: "x" });
    expect(svc.notionSearch).toHaveBeenCalledWith("x", undefined);
  });

  it("search_notion surfaces a Notion rate-limit error", async () => {
    svc.notionSearch.mockRejectedValue(new Error("Notion ha limitado las peticiones"));
    const { tools } = await buildExpert([], ["notion"]);
    const out = await exec(tools.search_notion)({ query: "x" });
    expect(String(out["error"])).toMatch(/limitado/);
  });

  it("query_notion_database forwards only the options given", async () => {
    svc.notionQuery.mockResolvedValue([item]);
    const { tools } = await buildExpert([], ["notion"]);
    const full = await exec(tools.query_notion_database)({
      databaseId: "db",
      filter: { a: 1 },
      sorts: [{ b: 2 }],
      pageSize: 10,
    });
    expect(full["results"]).toEqual([item]);
    expect(svc.notionQuery).toHaveBeenCalledWith("db", {
      filter: { a: 1 },
      sorts: [{ b: 2 }],
      pageSize: 10,
    });

    const bare = await exec(tools.query_notion_database)({ databaseId: "db" });
    expect(bare["results"]).toEqual([item]);
    expect(svc.notionQuery).toHaveBeenLastCalledWith("db", {});
  });

  it("query_notion_database surfaces an error", async () => {
    svc.notionQuery.mockRejectedValue(new Error("Notion respondió 404"));
    const { tools } = await buildExpert([], ["notion"]);
    const out = await exec(tools.query_notion_database)({ databaseId: "db" });
    expect(out["error"]).toBe("Notion respondió 404");
  });

  it("describe_notion_data_source returns the property schema", async () => {
    svc.notionDescribe.mockResolvedValue({
      id: "ds",
      title: "Tareas",
      properties: [{ name: "Estado", type: "status" }],
    });
    const { tools } = await buildExpert([], ["notion"]);
    const out = await exec(tools.describe_notion_data_source)({ dataSourceId: "ds" });
    expect(out["properties"]).toEqual([{ name: "Estado", type: "status" }]);
    expect(svc.notionDescribe).toHaveBeenCalledWith("ds");
  });

  it("describe_notion_data_source surfaces an error", async () => {
    svc.notionDescribe.mockRejectedValue(new Error("La conexión con Notion ya no es válida"));
    const { tools } = await buildExpert([], ["notion"]);
    const out = await exec(tools.describe_notion_data_source)({ dataSourceId: "ds" });
    expect(String(out["error"])).toMatch(/ya no es válida/);
  });

  it("read_notion_page returns the text, and notes an empty page", async () => {
    svc.notionRead.mockResolvedValue("contenido");
    const { tools } = await buildExpert([], ["notion"]);
    const out = await exec(tools.read_notion_page)({ pageId: "p1" });
    expect(out).toEqual({ pageId: "p1", content: "contenido" });

    svc.notionRead.mockResolvedValue("");
    const empty = await exec(tools.read_notion_page)({ pageId: "p1" });
    expect(empty["content"]).toBeNull();
    expect(String(empty["note"])).toMatch(/no contiene texto/);
  });

  it("read_notion_page surfaces an error", async () => {
    svc.notionRead.mockRejectedValue(new Error("Notion respondió 404"));
    const { tools } = await buildExpert([], ["notion"]);
    const out = await exec(tools.read_notion_page)({ pageId: "p1" });
    expect(out["error"]).toBe("Notion respondió 404");
  });

  it("create_notion_page creates and audits the page", async () => {
    svc.notionCreate.mockResolvedValue(item);
    const { tools } = await buildExpert([], ["notion"]);
    const out = await exec(tools.create_notion_page)({
      databaseId: "db",
      properties: { Name: { title: [] } },
    });
    expect(out["action"]).toBe("created");
    expect(out["id"]).toBe("p1");
    expect(svc.notionCreate).toHaveBeenCalledWith("db", { Name: { title: [] } });
  });

  it("create_notion_page surfaces a stale-connection error", async () => {
    svc.notionCreate.mockRejectedValue(new Error("La conexión con Notion ya no es válida"));
    const { tools } = await buildExpert([], ["notion"]);
    const out = await exec(tools.create_notion_page)({ databaseId: "db", properties: {} });
    expect(String(out["error"])).toMatch(/ya no es válida/);
  });

  it("update_notion_page updates and audits the page", async () => {
    svc.notionUpdate.mockResolvedValue(item);
    const { tools } = await buildExpert([], ["notion"]);
    const out = await exec(tools.update_notion_page)({
      pageId: "p1",
      properties: { Done: { checkbox: true } },
    });
    expect(out["action"]).toBe("updated");
    expect(svc.notionUpdate).toHaveBeenCalledWith("p1", { Done: { checkbox: true } });
  });

  it("update_notion_page surfaces an error", async () => {
    svc.notionUpdate.mockRejectedValue(new Error("Notion respondió 400"));
    const { tools } = await buildExpert([], ["notion"]);
    const out = await exec(tools.update_notion_page)({ pageId: "p1", properties: {} });
    expect(out["error"]).toBe("Notion respondió 400");
  });

  it("append_notion_blocks appends and audits", async () => {
    svc.notionAppend.mockResolvedValue({ id: "p1", object: "block", title: "(bloques añadidos)" });
    const { tools } = await buildExpert([], ["notion"]);
    const out = await exec(tools.append_notion_blocks)({
      pageId: "p1",
      children: [{ object: "block" }],
    });
    expect(out["action"]).toBe("appended");
    expect(svc.notionAppend).toHaveBeenCalledWith("p1", [{ object: "block" }]);
  });

  it("append_notion_blocks surfaces an error", async () => {
    svc.notionAppend.mockRejectedValue(new Error("Notion respondió 429"));
    const { tools } = await buildExpert([], ["notion"]);
    const out = await exec(tools.append_notion_blocks)({ pageId: "p1", children: [] });
    expect(out["error"]).toBe("Notion respondió 429");
  });
});

describe("context denial across every gated tool", () => {
  it("refuses each tool when neither its domain nor its source is available", async () => {
    // Expert with no domains and no sources: every guarded tool must refuse
    // before touching the (mocked) service layer.
    const { tools, used } = await buildExpert([], []);
    const cases: [unknown, unknown][] = [
      [tools.get_pipeline_summary, {}],
      [tools.list_deals, {}],
      [tools.list_overdue_invoices, {}],
      [tools.get_campaign_performance, {}],
      [tools.get_churn_risk, {}],
      [tools.propose_invoice_reminders, { invoiceIds: "i1" }],
      [tools.propose_pause_campaigns, { campaignIds: "c1" }],
      [tools.search_drive, { query: "x" }],
      [tools.read_drive_file, { fileId: "f1" }],
      [tools.create_drive_file, { name: "n", content: "c", kind: "text" }],
      [tools.update_drive_file, { fileId: "f1", content: "c" }],
      [tools.list_local_files, {}],
      [tools.search_local_files, { query: "x" }],
      [tools.read_local_file, { path: "/x/y.txt" }],
      [tools.create_local_file, { folder: "/x", name: "n", content: "c" }],
      [tools.update_local_file, { path: "/x/y.txt", content: "c" }],
      [tools.search_notion, { query: "x" }],
      [tools.query_notion_database, { databaseId: "db" }],
      [tools.describe_notion_data_source, { dataSourceId: "ds" }],
      [tools.read_notion_page, { pageId: "p1" }],
      [tools.create_notion_page, { databaseId: "db", properties: {} }],
      [tools.update_notion_page, { pageId: "p1", properties: {} }],
      [tools.append_notion_blocks, { pageId: "p1", children: [] }],
    ];
    for (const [tool, input] of cases) {
      const out = await exec(tool)(input);
      expect(String(out["error"])).toMatch(/Fuera de contexto/);
    }
    expect(used.size).toBe(0);
    // No service call leaked through the guard.
    expect(svc.driveRead).not.toHaveBeenCalled();
    expect(svc.notionSearch).not.toHaveBeenCalled();
    expect(svc.readLocalFile).not.toHaveBeenCalled();
  });
});

describe("propose_invoice_reminders guard rails", () => {
  it("reports no connected finance source when Holded is disconnected", async () => {
    const { getDb, persist } = await import("../db.server");
    const { raw } = await getDb();
    raw.run("UPDATE integrations SET connected = 0 WHERE id = ?", ["holded"]);
    await persist();
    try {
      const { tools } = await buildExpert(["finanzas"]);
      const out = await exec(tools.propose_invoice_reminders)({ invoiceIds: "inv-anything" });
      expect(String(out["error"])).toContain("No hay ninguna fuente");
    } finally {
      raw.run("UPDATE integrations SET connected = 1 WHERE id = ?", ["holded"]);
      await persist();
    }
  });

  it("errors when none of the given ids is an overdue invoice", async () => {
    const { tools, proposals } = await buildExpert(["finanzas"]);
    const out = await exec(tools.propose_invoice_reminders)({ invoiceIds: ["no-such-id"] });
    expect(String(out["error"])).toMatch(/Ninguna de esas facturas/);
    expect(proposals).toHaveLength(0);
  });
});

describe("file content tools", () => {
  it("list_local_files caps the listing and still reports the total", async () => {
    svc.loadLocalRoots.mockReturnValue([{ path: "/r", name: "r" }]);
    svc.listLocalFiles.mockReturnValue(
      Array.from({ length: 250 }, (_, i) => ({ path: `/r/f${i}.txt`, name: `f${i}.txt`, size: 1 })),
    );
    const { tools } = await buildExpert([], ["local"]);
    const out = await exec(tools.list_local_files)({});
    expect(out["total"]).toBe(250);
    expect((out["files"] as unknown[]).length).toBe(200);
    expect(String(out["note"])).toContain("200 de 250");
  });

  it("read_local_file forwards the window and returns the table shape", async () => {
    svc.loadLocalRoots.mockReturnValue([{ path: "/r", name: "r" }]);
    svc.readLocalFile.mockResolvedValue({
      path: "/r/i.csv",
      name: "i.csv",
      size: 40,
      modifiedTime: "2026-01-01T00:00:00.000Z",
      content: "a,b",
      totalLines: 3,
      hasMore: true,
      nextOffset: 3,
      sheets: [{ name: "i.csv", rows: 2, columns: ["a", "b"] }],
    });
    const { tools } = await buildExpert([], ["local"]);
    const out = await exec(tools.read_local_file)({ path: "/r/i.csv", offset: 1, limit: 2 });
    expect(svc.readLocalFile).toHaveBeenCalledWith("/r/i.csv", ["/r"], { offset: 1, limit: 2 });
    expect(out["hasMore"]).toBe(true);
    expect((out["sheets"] as { rows: number }[])[0]?.rows).toBe(2);
  });

  it("search_inside_files returns the lines where the text appears", async () => {
    svc.loadLocalRoots.mockReturnValue([{ path: "/r", name: "r" }]);
    svc.searchLocalContent.mockResolvedValue({
      hits: [{ path: "/r/i.csv", name: "i.csv", line: 2, text: "2026-01-01,ACME,100" }],
      scanned: 1,
      skipped: 0,
      hasMore: false,
    });
    const { tools, used } = await buildExpert([], ["local"]);
    const out = await exec(tools.search_inside_files)({ query: "acme" });
    expect(svc.searchLocalContent).toHaveBeenCalledWith(["/r"], "acme");
    expect((out["hits"] as { line: number }[])[0]?.line).toBe(2);
    expect(used.has("Archivos locales")).toBe(true);
  });
});
