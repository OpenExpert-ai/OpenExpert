// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-eeq-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

async function raw() {
  const { getDb } = await import("./db.server");
  return (await getDb()).raw;
}

describe("pipelineSummary", () => {
  it("aggregates open deals, win rate, forecast and stalled deals", async () => {
    const db = await raw();
    db.run("DELETE FROM deals");
    const ins =
      "INSERT INTO deals (id,company,stage,value,owner,days_in_stage,status) VALUES (?,?,?,?,?,?,?)";
    db.run(ins, ["d1", "A", "Negociación", 1000, "x", 30, "open"]);
    db.run(ins, ["d2", "B", "Propuesta", 500, "y", 2, "open"]);
    db.run(ins, ["d3", "C", "Propuesta", 800, "z", 0, "won"]);
    db.run(ins, ["d4", "D", "Demo", 200, "z", 0, "lost"]);

    const ee = await import("./ee.server");
    const s = await ee.pipelineSummary();
    expect(s.openDeals).toBe(2);
    expect(s.openValue).toBe(1500);
    expect(s.winRate).toBeCloseTo(0.5);
    expect(s.forecast).toBe(925);
    expect(s.stalled.map((d) => d.company)).toEqual(["A"]);
  });

  it("returns a zero win rate with no closed deals", async () => {
    const db = await raw();
    db.run("DELETE FROM deals");
    const ee = await import("./ee.server");
    expect((await ee.pipelineSummary()).winRate).toBe(0);
  });
});

describe("listDeals", () => {
  it("filters open deals by stage, case-insensitively", async () => {
    const db = await raw();
    db.run("DELETE FROM deals");
    const ins =
      "INSERT INTO deals (id,company,stage,value,owner,days_in_stage,status) VALUES (?,?,?,?,?,?,?)";
    db.run(ins, ["d1", "A", "Demo", 100, "x", 1, "open"]);
    db.run(ins, ["d2", "B", "Propuesta", 300, "y", 1, "open"]);
    const ee = await import("./ee.server");
    expect((await ee.listDeals("demo")).map((d) => d.company)).toEqual(["A"]);
    expect((await ee.listDeals(null)).length).toBe(2);
  });
});

describe("overdueInvoices", () => {
  it("returns overdue invoices over the minimum, sorted by amount", async () => {
    const db = await raw();
    db.run("DELETE FROM invoices");
    const ins =
      "INSERT INTO invoices (id,client,amount,due_date,status,reminders) VALUES (?,?,?,?,?,?)";
    db.run(ins, ["i1", "A", 500, "2020-01-01", "overdue", 0]);
    db.run(ins, ["i2", "B", 5000, "2020-01-01", "overdue", 1]);
    db.run(ins, ["i3", "C", 9000, "2099-01-01", "open", 0]);
    const ee = await import("./ee.server");
    expect((await ee.overdueInvoices(null)).map((i) => i.client)).toEqual(["B", "A"]);
    expect((await ee.overdueInvoices(1000)).map((i) => i.client)).toEqual(["B"]);
    expect((await ee.overdueInvoices(null))[0]!.daysOverdue).toBeGreaterThan(0);
  });
});

describe("campaignPerformance", () => {
  it("computes CPA and over-target percentage", async () => {
    const db = await raw();
    db.run("DELETE FROM campaigns");
    db.run(
      "INSERT INTO campaigns (id,name,channel,status,spend_7d,conversions_7d,cpa_target,daily_budget) VALUES (?,?,?,?,?,?,?,?)",
      ["c1", "Meta", "Meta Ads", "active", 1000, 10, 50, 100],
    );
    const ee = await import("./ee.server");
    const [c] = await ee.campaignPerformance();
    expect(c!.cpa).toBe(100);
    expect(c!.overTargetPct).toBe(100);
  });
});

describe("churnRisk", () => {
  it("sorts accounts by churn risk", async () => {
    const db = await raw();
    db.run("DELETE FROM accounts");
    db.run(
      "INSERT INTO accounts (id,name,mrr,usage_trend,open_tickets,churn_risk) VALUES (?,?,?,?,?,?)",
      ["a1", "A", 100, -0.1, 1, 0.2],
    );
    db.run(
      "INSERT INTO accounts (id,name,mrr,usage_trend,open_tickets,churn_risk) VALUES (?,?,?,?,?,?)",
      ["a2", "B", 200, -0.3, 3, 0.9],
    );
    const ee = await import("./ee.server");
    const rows = await ee.churnRisk();
    expect(rows.map((a) => a.name)).toEqual(["B", "A"]);
    expect(rows[0]!.usageTrendPct).toBe(-30);
  });
});
