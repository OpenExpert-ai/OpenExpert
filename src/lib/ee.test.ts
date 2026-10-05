// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-ee-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

describe("revertSnapshot", () => {
  it("restores a partial snapshot without wiping untouched columns", async () => {
    const { getDb, persist } = await import("./db.server");
    const ee = await import("./ee.server");
    const schema = await import("../../drizzle/schema");
    const { orm, raw } = await getDb();

    raw.run(
      "INSERT OR REPLACE INTO experts (id,name,description,sources,domains,created_at) VALUES (?,?,?,?,?,?)",
      ["e-partial", "Original", "desc", '["gdrive"]', '["ventas"]', "2026-01-01"],
    );
    // Only a subset of columns is captured: reverting must not wipe the rest.
    const entries = ee.snapshotRows("experts", ["id"], [{ id: "e-partial", name: "Original" }]);

    raw.run("UPDATE experts SET name = 'Cambiado' WHERE id = ?", ["e-partial"]);
    await persist();

    await ee.revertSnapshot(entries);

    const row = orm
      .select()
      .from(schema.experts)
      .all()
      .find((e) => e.id === "e-partial");
    expect(row?.name).toBe("Original");
    expect(row?.description).toBe("desc");
    expect(row?.sources).toEqual(["gdrive"]);
    expect(row?.domains).toEqual(["ventas"]);
  });

  it("recreates a row deleted after the snapshot", async () => {
    const { getDb, persist } = await import("./db.server");
    const ee = await import("./ee.server");
    const schema = await import("../../drizzle/schema");
    const { orm, raw } = await getDb();

    raw.run(
      "INSERT OR REPLACE INTO experts (id,name,description,sources,domains,created_at) VALUES (?,?,?,?,?,?)",
      ["e-gone", "Otro", "d2", '["gdrive"]', '["finanzas"]', "2026-01-02"],
    );
    const entries = ee.snapshotRows(
      "experts",
      ["id"],
      await ee.fetchRows("experts", "id", ["e-gone"]),
    );
    raw.run("DELETE FROM experts WHERE id = ?", ["e-gone"]);
    await persist();

    await ee.revertSnapshot(entries);

    const row = orm
      .select()
      .from(schema.experts)
      .all()
      .find((e) => e.id === "e-gone");
    expect(row?.name).toBe("Otro");
    expect(row?.domains).toEqual(["finanzas"]);
  });

  it("deletes rows whose `before` is null (created since)", async () => {
    const { getDb, persist } = await import("./db.server");
    const ee = await import("./ee.server");
    const { raw } = await getDb();

    raw.run("DELETE FROM experts WHERE id = ?", ["e-revert"]);
    raw.run(
      "INSERT OR REPLACE INTO experts (id,name,description,sources,created_at) VALUES (?,?,?,?,?)",
      ["e-revert", "Nuevo", "", "[]", "2026-01-01"],
    );
    await persist();

    const del = [{ table: "experts", pk: { id: "e-revert" }, before: null }];
    await ee.revertSnapshot(del);

    const exists = raw.exec("SELECT id FROM experts WHERE id='e-revert'")[0]?.values.length ?? 0;
    expect(exists).toBe(0);
  });

  it("restores an Expert edited after the snapshot", async () => {
    const { getDb, persist } = await import("./db.server");
    const ee = await import("./ee.server");
    const schema = await import("../../drizzle/schema");
    const { orm, raw } = await getDb();

    const id = "e-edit";
    raw.run(
      "INSERT OR REPLACE INTO experts (id,name,description,sources,domains,created_at) VALUES (?,?,?,?,?,?)",
      [id, "Original", "desc", '["gdrive"]', '["ventas"]', "2026-01-01"],
    );
    await persist();

    // Same shape `updateExpert` records: raw columns, not Drizzle field names.
    const entries = ee.snapshotRows("experts", ["id"], await ee.fetchRows("experts", "id", [id]));

    raw.run("UPDATE experts SET name = 'Cambiado', domains = '[\"finanzas\"]' WHERE id = ?", [id]);
    await persist();

    await ee.revertSnapshot(entries);

    const row = orm
      .select()
      .from(schema.experts)
      .all()
      .find((e) => e.id === id);
    expect(row?.name).toBe("Original");
    expect(row?.domains).toEqual(["ventas"]);
    expect(row?.sources).toEqual(["gdrive"]);
  });
});

describe("executePending", () => {
  it("snapshots paused campaigns so the action can be reverted", async () => {
    const { getDb, persist } = await import("./db.server");
    const ee = await import("./ee.server");
    const schema = await import("../../drizzle/schema");
    const { orm, raw } = await getDb();

    raw.run(
      "INSERT OR REPLACE INTO campaigns (id,name,channel,status,spend_7d,conversions_7d,cpa_target,daily_budget) VALUES (?,?,?,?,?,?,?,?)",
      ["c-revert", "Campaña", "Meta Ads", "active", 1000, 10, 50, 100],
    );
    await persist();

    const result = await ee.executePending({ kind: "pause_campaigns", ids: ["c-revert"] });
    expect(
      orm
        .select()
        .from(schema.campaigns)
        .all()
        .find((c) => c.id === "c-revert")?.status,
    ).toBe("paused");

    await ee.revertSnapshot(result.snapshot);
    expect(
      orm
        .select()
        .from(schema.campaigns)
        .all()
        .find((c) => c.id === "c-revert")?.status,
    ).toBe("active");
  });
});
