// @vitest-environment jsdom
// SPDX-License-Identifier: MIT
// The activity screen showed a duration for every event: `(a.duration_ms / 1000)
// .toFixed(2)`, and the column carried a default of 300 for the events nobody
// timed. The footer of an event therefore said "0.30s" about actions that had
// never been measured — in an audit trail, a number nobody measured reads as a
// real one.
//
// The line is mounted on its own: the route drags in the server functions and
// the whole workspace, and what matters here is what the line shows.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n", () => ({
  useT: () => ({ t: (s: string) => s, locale: "es" as const }),
}));

import { ActivityEventMeta } from "./ActivityEventMeta";

const base = {
  id: "evt-1",
  ts: "2026-01-02T03:04:00.000Z",
  sources: [] as string[],
  hasSnapshot: false,
};

describe("ActivityEventMeta", () => {
  afterEach(cleanup);

  it("shows the measured duration", () => {
    render(<ActivityEventMeta {...base} duration_ms={3349} />);

    expect(screen.getByText("3.35s")).toBeTruthy();
  });

  it("shows a dash when the event was not timed, instead of a number", () => {
    render(<ActivityEventMeta {...base} duration_ms={null} />);

    expect(screen.getByText("—")).toBeTruthy();
    // The old rendering said "0.00s" here, and "0.30s" for the 300 ms default.
    expect(screen.queryByText("0.00s")).toBeNull();
    expect(screen.queryByText("0.30s")).toBeNull();
  });

  it("still shows the id, the sources and the snapshot mark", () => {
    render(
      <ActivityEventMeta
        {...base}
        duration_ms={null}
        sources={["Google Drive"]}
        hasSnapshot={true}
      />,
    );

    expect(screen.getByText("evt-1")).toBeTruthy();
    expect(screen.getByText(/Google Drive/)).toBeTruthy();
    expect(screen.getByText(/snapshot/)).toBeTruthy();
  });

  // The line carried the time of day only, so a row from last year and a row
  // from this one read the same and the audit trail could not be placed in time.
  it("writes the year of an event from another year, and not of one from this one", () => {
    const lastYear = new Date(new Date().getFullYear() - 1, 5, 15, 10, 30);
    render(<ActivityEventMeta {...base} ts={lastYear.toISOString()} duration_ms={null} />);
    expect(screen.getByText(new RegExp(String(lastYear.getFullYear())))).toBeTruthy();
    cleanup();

    const thisYear = new Date(new Date().getFullYear(), 5, 15, 10, 30);
    render(<ActivityEventMeta {...base} ts={thisYear.toISOString()} duration_ms={null} />);
    expect(screen.queryByText(new RegExp(String(thisYear.getFullYear())))).toBeNull();
  });
});
