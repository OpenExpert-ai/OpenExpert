// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { mapHoldedInvoice, mapPipedriveDeal } from "./connectors";
import { fetchHoldedInvoices, fetchPipedriveDeals } from "./connectors.server";

describe("mapPipedriveDeal", () => {
  it("maps names, stage, value and days in stage", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    const row = mapPipedriveDeal(
      {
        id: 42,
        title: "Deal",
        org_name: "Clínica Sur",
        owner_name: "Ana",
        stage_id: 3,
        value: 8400,
        status: "open",
        stage_change_time: "2026-10-15 00:00:00",
        expected_close_date: "2026-11-15",
      },
      new Map([["3", "Negociación"]]),
      now,
    );
    expect(row).toMatchObject({
      id: "pd-42",
      company: "Clínica Sur",
      stage: "Negociación",
      value: 8400,
      owner: "Ana",
      daysInStage: 12,
      closeDate: "2026-11-15",
      status: "open",
    });
  });

  it("drops a deleted deal and falls back to the person or title", () => {
    expect(mapPipedriveDeal({ id: 1, deleted: true }, new Map())).toBeNull();
    expect(mapPipedriveDeal({ id: 2, person_name: "Ana", title: "X" }, new Map())?.company).toBe(
      "Ana",
    );
  });
});

describe("mapHoldedInvoice", () => {
  it("maps contact, amount, due date and status", () => {
    expect(
      mapHoldedInvoice({
        id: "inv-1",
        contact_name: "Talleres Norte",
        total: "6800.50",
        due_date: "2026-09-30",
        status: "pending",
      }),
    ).toEqual({
      id: "holded-inv-1",
      client: "Talleres Norte",
      amount: 6800.5,
      dueDate: "2026-09-30",
      status: "open",
      reminders: 0,
    });
  });

  it("maps a completed invoice to paid and skips one without a date", () => {
    expect(
      mapHoldedInvoice({
        id: "inv-2",
        contact_name: "Clínica",
        total: "10",
        due_date: "2026-10-01",
        status: "completed",
      })?.status,
    ).toBe("paid");
    expect(mapHoldedInvoice({ id: "inv-3", contact_name: "X" })).toBeNull();
  });
});

describe("fetchPipedriveDeals", () => {
  it("follows offset pagination and keeps the stage name", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("/stages")) {
        return new Response(JSON.stringify({ data: [{ id: 3, name: "Negociación" }] }));
      }
      if (String(url).includes("start=0")) {
        return new Response(
          JSON.stringify({
            data: [{ id: 1, org_name: "A", stage_id: 3, value: 10, status: "open" }],
            additional_data: { pagination: { more_items_in_collection: true, next_start: 1 } },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          data: [{ id: 2, org_name: "B", stage_id: 3, value: 20, status: "won" }],
          additional_data: { pagination: { more_items_in_collection: false } },
        }),
      );
    }) as unknown as typeof fetch;

    const out = await fetchPipedriveDeals("token", fetchMock);
    expect(out.fetched).toBe(2);
    expect(out.rows).toHaveLength(2);
    expect(calls.some((c) => c.includes("/stages"))).toBe(true);
    expect(calls.some((c) => c.includes("start=1"))).toBe(true);
  });
});

describe("fetchHoldedInvoices", () => {
  it("follows the cursor and maps the items", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("cursor=next")) {
        return new Response(
          JSON.stringify({
            items: [{ id: "2", contact_name: "B", total: "20", due_date: "2026-10-02" }],
            has_more: false,
          }),
        );
      }
      return new Response(
        JSON.stringify({
          items: [{ id: "1", contact_name: "A", total: "10", due_date: "2026-10-01" }],
          has_more: true,
          cursor: "next",
        }),
      );
    }) as unknown as typeof fetch;

    const out = await fetchHoldedInvoices("key", fetchMock);
    expect(out.fetched).toBe(2);
    expect(out.rows.map((r) => (r.entity === "invoices" ? r.data.client : ""))).toEqual(["A", "B"]);
  });
});
