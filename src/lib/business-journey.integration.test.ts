// SPDX-License-Identifier: MIT
// A cross-module journey on a disposable installation. The transport is mocked,
// while validation, SQLite, tools, approvals, snapshots and encryption are real.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

type ServerFn = ((opts?: { data?: unknown }) => Promise<unknown>) & {
  validator: (validate: (input: unknown) => unknown) => ServerFn;
  handler: (run: (ctx: { data: unknown }) => unknown) => ServerFn;
};
vi.mock("@tanstack/react-start", () => ({
  createServerFn: (): ServerFn => {
    let validate = (input: unknown) => input;
    let run: (ctx: { data: unknown }) => unknown;
    const call = (async (opts?: { data?: unknown }) =>
      run({ data: validate(opts?.data) })) as ServerFn;
    call.validator = (next) => {
      validate = next;
      return call;
    };
    call.handler = (next) => {
      run = next;
      return call;
    };
    return call;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ origin: "http://localhost:3000" }),
}));

let dir: string;
let previousDir: string | undefined;
let previousCwd: string;
beforeAll(() => {
  previousDir = process.env["OPENEXPERT_DATA_DIR"];
  previousCwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), "openexpert-journey-"));
  process.env["OPENEXPERT_DATA_DIR"] = join(dir, "data");
  process.chdir(dir);
});
afterAll(async () => {
  const { resetDbHandle } = await import("./db.server");
  resetDbHandle();
  process.chdir(previousCwd);
  if (previousDir === undefined) delete process.env["OPENEXPERT_DATA_DIR"];
  else process.env["OPENEXPERT_DATA_DIR"] = previousDir;
  rmSync(dir, { recursive: true, force: true });
});

it("imports an invoice, proposes and approves a reminder, reverts it and restores an encrypted backup", async () => {
  const { importBusinessCsv } = await import("./business.functions");
  const { createChatTools } = await import("./ai/tools");
  const ee = await import("./ee.server");
  const { decideAction, revertEvent } = await import("./data.functions");
  const { buildBackup, restoreBackup } = await import("./backup.server");
  const { encryptBackup, decryptBackup } = await import("./backup-crypto");

  const imported = await importBusinessCsv({
    data: {
      entity: "invoices",
      content: "id,client,amount,due_date\njourney-1,Acme,1200,2000-01-01",
    },
  });
  expect(imported).toMatchObject({ inserted: 1, skipped: 0 });
  const used = new Set<string>();
  const tools = createChatTools({
    expert: { name: "Finanzas", sources: [] },
    expertId: "general",
    used,
    allowed: (domain) => domain === "finanzas",
    proposePending: async (domain, title, risk, items, pending) => {
      const eventId = await ee.logActivity({
        actor: "agent",
        actor_name: "OpenExpert",
        type: risk,
        expert_id: domain,
        status: "pending",
        summary: title,
        sources: [...used],
        snapshot: { pending },
      });
      return { eventId, title, risk, items, status: "pending" as const };
    },
  });
  type Tool = { execute: (input: unknown) => Promise<Record<string, unknown>> };
  const list = (tools.list_overdue_invoices as unknown as Tool).execute;
  const propose = (tools.propose_invoice_reminders as unknown as Tool).execute;
  const read = async () => (await list({}))["invoices"] as Array<Record<string, unknown>>;
  expect(await read()).toEqual([
    expect.objectContaining({ id: "journey-1", amount: 1200, reminders: 0 }),
  ]);

  const proposed = await propose({ invoiceIds: ["journey-1"] });
  expect(proposed["status"]).toBe("pending");
  expect((await read())[0]?.["reminders"]).toBe(0);
  const eventId = proposed["eventId"] as string;
  await decideAction({ data: { eventId, approve: true } });
  expect((await read())[0]?.["reminders"]).toBe(1);

  const secret = "una contraseña de prueba";
  const encrypted = encryptBackup(JSON.stringify(buildBackup()), secret);
  expect(encrypted).not.toContain("Acme");
  await revertEvent({ data: { id: eventId } });
  expect((await read())[0]?.["reminders"]).toBe(0);
  expect(() => decryptBackup(encrypted, "clave incorrecta")).toThrow();
  expect((await read())[0]?.["reminders"]).toBe(0);
  await restoreBackup(decryptBackup(encrypted, secret));
  expect((await read())[0]).toMatchObject({ id: "journey-1", client: "Acme", reminders: 1 });
});
