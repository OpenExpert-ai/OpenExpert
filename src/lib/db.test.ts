// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    // Once per capability in `DEFAULT_INTEGRATIONS`: each new source is a deliberate addition here.
    expect(orm.select().from(schema.integrations).all().length).toBe(11);
  });

  it("does not seed example business data", async () => {
    const { getDb } = await import("./db.server");
    const schema = await import("../../drizzle/schema");
    const { orm } = await getDb();

    expect(orm.select().from(schema.deals).all().length).toBe(0);
    expect(orm.select().from(schema.invoices).all().length).toBe(0);
    expect(orm.select().from(schema.campaigns).all().length).toBe(0);
    expect(orm.select().from(schema.accounts).all().length).toBe(0);
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

  it("tries again after a failed start instead of caching the rejection", async () => {
    // The regression: `handle = init()` kept the rejected promise forever, so one failure (a full
    // disk, a locked directory) made every later request fail with the same error until the process
    // was restarted — the Retry button in the UI could never work.
    const { getDb, resetDbHandle, dbPath } = await import("./db.server");
    const good = process.env["OPENEXPERT_DATA_DIR"]!;
    // A parent that is a regular file: `mkdirSync` fails, so the first start cannot succeed.
    const blocker = join(dir, "not-a-directory");
    writeFileSync(blocker, "");
    try {
      resetDbHandle();
      process.env["OPENEXPERT_DATA_DIR"] = join(blocker, "data");
      await expect(getDb()).rejects.toThrow();

      // Same process, same module: with the rejection no longer cached the next call connects.
      process.env["OPENEXPERT_DATA_DIR"] = good;
      const { orm } = await getDb();
      expect(
        orm
          .select()
          .from((await import("../../drizzle/schema")).experts)
          .all().length,
      ).toBe(4);
      expect(existsSync(dbPath())).toBe(true);
    } finally {
      process.env["OPENEXPERT_DATA_DIR"] = good;
    }
  });
});
