// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import schemaSql from "../../drizzle/init.sql?raw";
import { parseBusinessCsv } from "./business-csv";

let dir: string;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-provenance-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(schemaSql.replaceAll(",\n  import_source TEXT,\n  imported_at TEXT", ""));
  db.run("ALTER TABLE experts ADD COLUMN domains TEXT NOT NULL DEFAULT '[]'");
  db.run("INSERT INTO deals (id, company, stage) VALUES ('legacy', 'Anterior', 'Demo')");
  db.run("PRAGMA user_version = 7");
  writeFileSync(join(dir, "openexpert.db"), Buffer.from(db.export()));
  db.close();
});
afterAll(() => {
  delete process.env["OPENEXPERT_DATA_DIR"];
  rmSync(dir, { recursive: true, force: true });
});

describe("procedencia de última importación", () => {
  it("mantiene desconocida la fuente antigua y actualiza la fuente en cada importación", async () => {
    const { getDb } = await import("./db.server");
    const { orm, raw } = await getDb();
    expect(raw.exec("PRAGMA integrity_check")[0]?.values).toEqual([["ok"]]);
    expect(raw.exec("PRAGMA index_list(deals)")[0]?.values.length).toBeGreaterThan(0);
    const { deals } = await import("../../drizzle/schema");
    const { importBusinessRows } = await import("./business-import.server");
    const { listDeals } = await import("./ee.server");
    let legacy = orm
      .select()
      .from(deals)
      .all()
      .find((r) => r.id === "legacy");
    expect(legacy).toMatchObject({ importSource: null, importedAt: null });
    const rows = parseBusinessCsv(
      "deals",
      "id,company,stage,value\nlegacy,Importada,Demo,10\nlegacy,Final,Demo,12",
    ).rows;
    await importBusinessRows("deals", rows, "CSV");
    legacy = orm
      .select()
      .from(deals)
      .all()
      .find((r) => r.id === "legacy");
    expect(legacy).toMatchObject({ company: "Final", importSource: "CSV" });
    expect(legacy?.importedAt).toEqual(expect.any(String));
    const backup = await import("./backup.server");
    const inspection = await backup.inspectBackup(JSON.stringify(backup.buildBackup()));
    expect(inspection.included).toContain("db");
    await importBusinessRows("deals", rows.slice(0, 1), "Pipedrive");
    expect((await listDeals(null)).find((r) => r.id === "legacy")).toMatchObject({
      company: "Importada",
      lastImportSource: "Pipedrive",
      lastImportedAt: expect.any(String),
    });
  });
});
