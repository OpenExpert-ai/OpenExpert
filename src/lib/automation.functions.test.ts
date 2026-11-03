// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

type Fn = ((opts?: { data?: unknown }) => Promise<unknown>) & {
  validator: (f: (x: unknown) => unknown) => Fn;
  handler: (f: (ctx: { data: unknown }) => unknown) => Fn;
};
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (x: unknown) => x;
    let handler: (ctx: { data: unknown }) => unknown;
    const f = (async (opts?: { data?: unknown }) => handler({ data: validate(opts?.data) })) as Fn;
    f.validator = (next) => {
      validate = next;
      return f;
    };
    f.handler = (next) => {
      handler = next;
      return f;
    };
    return f;
  },
}));
let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-report-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});
afterAll(() => {
  delete process.env["OPENEXPERT_DATA_DIR"];
  rmSync(dir, { recursive: true, force: true });
});

it("runs only when enabled, records the count once even for simultaneous windows, and leaves invoices untouched", async () => {
  const { getDb } = await import("./db.server");
  const { raw } = await getDb();
  const fns = await import("./automation.functions");
  raw.run(
    "INSERT INTO invoices (id,client,amount,due_date,status,reminders) VALUES ('demo-one','Demo',50,'2000-01-01','open',0)",
  );
  expect(await fns.runDailyReport()).toEqual({ ran: false });
  await fns.setDailyReport({ data: { enabled: true } });
  const results = await Promise.all([fns.runDailyReport(), fns.runDailyReport()]);
  expect(results.filter((r) => r.ran)).toHaveLength(1);
  const rows =
    raw.exec("SELECT summary FROM activity WHERE id LIKE 'daily-overdue-report-%'")[0]?.values ??
    [];
  expect(rows).toHaveLength(1);
  expect(String(rows[0]?.[0])).toContain("1 factura");
  expect(String(rows[0]?.[0])).toContain("ejemplo");
  expect(raw.exec("SELECT reminders FROM invoices WHERE id='demo-one'")[0]?.values[0]?.[0]).toBe(0);
  await fns.setDailyReport({ data: { enabled: false } });
  expect(await fns.runDailyReport()).toEqual({ ran: false });
});
