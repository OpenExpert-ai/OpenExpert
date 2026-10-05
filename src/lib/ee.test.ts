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

const PROCESS_COLUMNS = [
  "id",
  "name",
  "description",
  "trigger",
  "stages",
  "limits",
  "approval",
  "expert_id",
  "active",
  "runs",
  "last_run",
];

describe("revertSnapshot", () => {
  it("restores a partial snapshot without wiping untouched columns", async () => {
    const { getDb, persist } = await import("./db.server");
    const ee = await import("./ee.server");
    const schema = await import("../../drizzle/schema");
    const { orm, raw } = await getDb();

    raw.run(
      `INSERT OR REPLACE INTO processes (${PROCESS_COLUMNS.join(",")}) VALUES (${PROCESS_COLUMNS.map(() => "?").join(",")})`,
      [
        "p-revert",
        "Proceso",
        "desc",
        "cron",
        '["a"]',
        '["l"]',
        "Requerida",
        "finanzas",
        1,
        5,
        "2026-01-01",
      ],
    );
    // Same shape the old process toggle used to record: only a subset of columns.
    const entries = ee.snapshotRows(
      "processes",
      ["id"],
      [{ id: "p-revert", active: 1, name: "Proceso", expert_id: "finanzas" }],
    );

    raw.run("UPDATE processes SET active = 0 WHERE id = ?", ["p-revert"]);
    await persist();

    await ee.revertSnapshot(entries);

    const row = orm
      .select()
      .from(schema.processes)
      .all()
      .find((p) => p.id === "p-revert");
    expect(row?.active).toBe(true);
    expect(row?.description).toBe("desc");
    expect(row?.trigger).toBe("cron");
    expect(row?.stages).toEqual(["a"]);
    expect(row?.approval).toBe("Requerida");
    expect(row?.runs).toBe(5);
    expect(row?.lastRun).toBe("2026-01-01");
  });

  it("recreates a row deleted after the snapshot", async () => {
    const { getDb, persist } = await import("./db.server");
    const ee = await import("./ee.server");
    const schema = await import("../../drizzle/schema");
    const { orm, raw } = await getDb();

    raw.run(
      `INSERT OR REPLACE INTO processes (${PROCESS_COLUMNS.join(",")}) VALUES (${PROCESS_COLUMNS.map(() => "?").join(",")})`,
      ["p-gone", "Otro", "d2", "t2", '["b"]', "[]", "Ninguna", "ventas", 1, 1, null],
    );
    const entries = ee.snapshotRows(
      "processes",
      ["id"],
      await ee.fetchRows("processes", "id", ["p-gone"]),
    );
    raw.run("DELETE FROM processes WHERE id = ?", ["p-gone"]);
    await persist();

    await ee.revertSnapshot(entries);

    const row = orm
      .select()
      .from(schema.processes)
      .all()
      .find((p) => p.id === "p-gone");
    expect(row?.name).toBe("Otro");
    expect(row?.stages).toEqual(["b"]);
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
