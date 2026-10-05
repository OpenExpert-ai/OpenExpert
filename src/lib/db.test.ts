// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-db-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

describe("local SQLite database", () => {
  it("creates the schema file and seeds example data", async () => {
    const { getDb, dbPath } = await import("./db.server");
    const schema = await import("../../drizzle/schema");
    const { orm } = await getDb();

    expect(existsSync(dbPath())).toBe(true);
    const experts = orm.select().from(schema.experts).all();
    expect(experts.map((e) => e.id)).toEqual(
      expect.arrayContaining(["general", "ventas", "finanzas", "marketing"]),
    );
    expect(orm.select().from(schema.processes).all().length).toBeGreaterThan(0);
    expect(orm.select().from(schema.integrations).all().length).toBe(9);
  });

  it("seeds example business data for the assistant", async () => {
    const { getDb } = await import("./db.server");
    const schema = await import("../../drizzle/schema");
    const { orm } = await getDb();

    expect(orm.select().from(schema.deals).all().length).toBeGreaterThan(0);
    expect(orm.select().from(schema.accounts).all().length).toBeGreaterThan(0);

    const invoices = orm.select().from(schema.invoices).all();
    expect(invoices.some((i) => i.status === "overdue")).toBe(true);

    const campaigns = orm.select().from(schema.campaigns).all();
    expect(campaigns.some((c) => c.status === "active")).toBe(true);
  });

  it("applies migrations and tracks the schema version", async () => {
    const { getDb } = await import("./db.server");
    const { raw } = await getDb();
    const version = raw.exec("PRAGMA user_version")[0]?.values[0]?.[0];
    expect(Number(version)).toBeGreaterThanOrEqual(1);
    const indexes = raw.exec("PRAGMA index_list(activity)")[0]?.values ?? [];
    expect(indexes.some((row) => row.includes("activity_expert"))).toBe(true);
  });

  it("persists writes across calls", async () => {
    const { getDb, persist } = await import("./db.server");
    const schema = await import("../../drizzle/schema");
    const { orm } = await getDb();
    orm
      .insert(schema.invoices)
      .values({
        id: "inv-1",
        client: "ACME",
        amount: 100,
        dueDate: "2026-01-01",
        status: "overdue",
        reminders: 0,
      })
      .run();
    await persist();
    const rows = orm.select().from(schema.invoices).all();
    expect(rows.some((r) => r.id === "inv-1" && r.status === "overdue")).toBe(true);
  });
});
