// SPDX-License-Identifier: MIT
// The activity log filed a duration for every event, even the ones nobody
// timed: `logActivity` stored `e.duration_ms ?? 300` and the column was
// `NOT NULL DEFAULT 300`, so the screen printed "0.30s" for actions that had
// never been measured. In an audit trail a number that nobody measured reads
// as a real one, so an event without a measurement must keep a null duration.
//
// These tests cover three things: what `logActivity` writes, what the column
// allows, and what the migration does to the databases that already carry the
// historical 300 ms rows.

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-duration-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

beforeEach(async () => {
  const db = await import("./db.server");
  db.resetDbHandle();
  rmSync(db.dbPath(), { force: true });
  await db.getDb();
});

afterEach(async () => {
  const db = await import("./db.server");
  db.resetDbHandle();
});

/* --------------------------- what logActivity writes ---------------------- */

describe("logActivity", () => {
  it("guarda duración nula cuando la acción no se ha cronometrado", async () => {
    const { getDb } = await import("./db.server");
    const ee = await import("./ee.server");
    const schema = await import("../../drizzle/schema");
    const { orm } = await getDb();

    const id = await ee.logActivity({
      actor: "human",
      actor_name: "Propietario local",
      type: "Configuración",
      expert_id: "general",
      status: "ok",
      summary: "Creado Experto",
    });

    const row = orm
      .select()
      .from(schema.activity)
      .all()
      .find((r) => r.id === id);
    expect(row).toBeTruthy();
    // No 300: nobody measured this one.
    expect(row?.durationMs).toBeNull();
  });

  it("guarda la duración que se le pasa, tal cual", async () => {
    const { getDb } = await import("./db.server");
    const ee = await import("./ee.server");
    const schema = await import("../../drizzle/schema");
    const { orm } = await getDb();

    const id = await ee.logActivity({
      actor: "agent",
      actor_name: "OpenExpert",
      type: "Consulta",
      expert_id: "general",
      status: "ok",
      summary: "Consulta: hola",
      duration_ms: 3349,
    });

    const row = orm
      .select()
      .from(schema.activity)
      .all()
      .find((r) => r.id === id);
    expect(row?.durationMs).toBe(3349);
  });

  it("acepta una duración nula explícita sin inventar nada", async () => {
    const { getDb } = await import("./db.server");
    const ee = await import("./ee.server");
    const schema = await import("../../drizzle/schema");
    const { orm } = await getDb();

    const id = await ee.logActivity({
      actor: "human",
      actor_name: "Propietario local",
      type: "Seguridad",
      expert_id: "general",
      status: "denied",
      summary: "Intento bloqueado",
      duration_ms: null,
    });

    const row = orm
      .select()
      .from(schema.activity)
      .all()
      .find((r) => r.id === id);
    expect(row?.durationMs).toBeNull();
  });
});

/* ------------------------------- the column ------------------------------- */

describe("la columna duration_ms", () => {
  it("admite nulos: no es NOT NULL y no tiene valor por defecto", async () => {
    const { getDb } = await import("./db.server");
    const { raw } = await getDb();
    const columns = raw.exec("PRAGMA table_info(activity)")[0]?.values ?? [];
    const duration = columns.find((c) => c[1] === "duration_ms");
    expect(duration).toBeTruthy();
    // notnull === 0 y dflt_value === null: sin 300 impuesto por la tabla.
    expect(duration?.[3]).toBe(0);
    expect(duration?.[4]).toBeNull();
  });

  it("los índices de la actividad siguen en pie tras la migración", async () => {
    const { getDb } = await import("./db.server");
    const { raw } = await getDb();
    const indexes = raw.exec("PRAGMA index_list(activity)")[0]?.values ?? [];
    const names = indexes.map((row) => row[1]);
    expect(names).toContain("activity_expert");
    expect(names).toContain("activity_ts");
  });
});

/* ------------------------------ the migration ----------------------------- */

describe("la migración 0007 sobre una base ya existente", () => {
  it("rehace la tabla sin NOT NULL y deja intactas las filas que ya había", async () => {
    // A database written by the previous version: the column was NOT NULL with
    // a default of 300, and it already carried rows. It is built with the real
    // DDL and the real migrations, so the only thing that differs from a
    // database of today is the shape of `activity` and the version number.
    const legacyDir = mkdtempSync(join(tmpdir(), "openexpert-legacy-"));
    const { loadSqlJs } = await import("./db.server");
    const SQL = await loadSqlJs();
    const legacy = new SQL.Database();

    const drizzle = fileURLToPath(new URL("../../drizzle/", import.meta.url));
    legacy.run(readFileSync(join(drizzle, "init.sql"), "utf8"));
    // The old shape of the table, with the NOT NULL and the default of 300.
    legacy.run("DROP TABLE activity");
    legacy.run(`CREATE TABLE activity (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      actor TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      type TEXT NOT NULL,
      expert_id TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      sources TEXT NOT NULL DEFAULT '[]',
      duration_ms INTEGER NOT NULL DEFAULT 300,
      snapshot TEXT
    )`);
    legacy.run("CREATE INDEX IF NOT EXISTS activity_expert ON activity (expert_id)");
    legacy.run("CREATE INDEX IF NOT EXISTS activity_ts ON activity (ts DESC)");
    // The migrations up to the one before this change.
    for (const file of readdirSync(join(drizzle, "migrations")).sort()) {
      if (/^000[1-6]_/.test(file))
        legacy.run(readFileSync(join(drizzle, "migrations", file), "utf8"));
    }
    legacy.run(
      "INSERT INTO activity (id,ts,actor,actor_name,type,expert_id,status,summary,sources,duration_ms) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [
        "evt-legacy",
        "2026-01-01T00:00:00.000Z",
        "human",
        "Propietario local",
        "Configuración",
        "general",
        "ok",
        "Evento anterior",
        "[]",
        300,
      ],
    );
    legacy.run("PRAGMA user_version = 6");
    writeFileSync(join(legacyDir, "openexpert.db"), Buffer.from(legacy.export()));
    legacy.close();

    const db = await import("./db.server");
    const good = process.env["OPENEXPERT_DATA_DIR"]!;
    try {
      db.resetDbHandle();
      process.env["OPENEXPERT_DATA_DIR"] = legacyDir;
      const { getDb } = await import("./db.server");
      const { orm, raw } = await getDb();

      const columns = raw.exec("PRAGMA table_info(activity)")[0]?.values ?? [];
      const duration = columns.find((c) => c[1] === "duration_ms");
      expect(duration?.[3]).toBe(0);
      expect(duration?.[4]).toBeNull();

      // The historical row is not rewritten: a past entry cannot be un-measured.
      const schema = await import("../../drizzle/schema");
      const rows = orm.select().from(schema.activity).all();
      const old = rows.find((r) => r.id === "evt-legacy");
      expect(old?.summary).toBe("Evento anterior");
      expect(old?.durationMs).toBe(300);

      // And from now on a row without a measurement can be filed.
      const ee = await import("./ee.server");
      const id = await ee.logActivity({
        actor: "human",
        actor_name: "Propietario local",
        type: "Configuración",
        expert_id: "general",
        status: "ok",
        summary: "Evento nuevo",
      });
      const fresh = orm
        .select()
        .from(schema.activity)
        .all()
        .find((r) => r.id === id);
      expect(fresh?.durationMs).toBeNull();
    } finally {
      process.env["OPENEXPERT_DATA_DIR"] = good;
      db.resetDbHandle();
      rmSync(legacyDir, { recursive: true, force: true });
    }
  });
});
