// @vitest-environment jsdom
// SPDX-License-Identifier: MIT
// What the page says about its own log. The window holds 300 events and the log
// holds more: the header used to print the window as the total, so the page
// claimed to be complete while the older events —and their revert buttons— were
// out of reach. These tests mount the page with a workspace that carries fewer
// events than the log has, and check both what it says and that «Cargar más»
// fetches the next page from the server instead of stopping at the window.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  ts: string;
  actor: string;
  actor_name: string;
  type: string;
  expert_id: string;
  status: string;
  summary: string;
  sources: string[];
  duration_ms: number | null;
  hasSnapshot: boolean;
  pending: unknown;
};

const event = (id: string): Row => ({
  id,
  ts: "2026-01-01T00:00:00.000Z",
  actor: "agent",
  actor_name: "Experto",
  type: "Consulta",
  expert_id: "general",
  status: "ok",
  summary: `evento ${id}`,
  sources: [],
  duration_ms: null,
  hasSnapshot: false,
  pending: null,
});

const { state, getPage } = vi.hoisted(() => ({
  state: {
    ws: {
      me: { name: "Propietario local", role: "ADMIN" as const },
      experts: [] as { id: string; name: string }[],
      activity: [] as unknown[],
      activityTotal: 0,
    },
  },
  getPage: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => () => ({}) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/i18n", () => ({
  useT: () => ({
    locale: "es" as const,
    t: (text: string, params?: Record<string, string | number>) =>
      params ? text.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? "")) : text,
  }),
}));
vi.mock("@/components/AppShell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  inputCls: "",
}));
vi.mock("@/components/activity/ActivityEventMeta", () => ({ ActivityEventMeta: () => null }));
vi.mock("@/lib/data.functions", () => ({
  getActivityPage: (opts: unknown) => getPage(opts),
  revertEvent: {},
  decideAction: {},
}));
vi.mock("@/lib/store", () => ({
  useWorkspace: () => ({ data: state.ws }),
  useMe: (ws: { me: unknown } | undefined) => ws?.me,
  useAct: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("ActivityPage y el recorte del registro", () => {
  let ActivityPage: (typeof import("./activity"))["ActivityPage"];

  beforeEach(async () => {
    getPage.mockReset();
    ({ ActivityPage } = await import("./activity"));
  });
  afterEach(cleanup);

  it("dice cuántos eventos hay de verdad y avisa de que quedan anteriores", async () => {
    state.ws = {
      me: { name: "Propietario local", role: "ADMIN" as const },
      experts: [],
      activity: Array.from({ length: 300 }, (_, i) => event(`evt_${i}`)),
      activityTotal: 305,
    };
    render(<ActivityPage />);

    expect(screen.getByText("300 de 305 eventos")).toBeTruthy();
    expect(
      screen.getByText(
        "Se listan los 300 eventos más recientes de 305. Los anteriores se cargan con «Cargar más».",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Cargar más")).toBeTruthy();
  });

  it("pide al servidor los eventos que la ventana no trae y los pinta", async () => {
    state.ws = {
      me: { name: "Propietario local", role: "ADMIN" as const },
      experts: [],
      activity: [event("evt_nuevo")],
      activityTotal: 3,
    };
    getPage.mockResolvedValue({
      activity: [event("evt_viejo_1"), event("evt_viejo_0")],
      total: 3,
      offset: 1,
      next_offset: 3,
    });
    render(<ActivityPage />);

    expect(screen.queryByText("evento evt_viejo_0")).toBeNull();
    fireEvent.click(screen.getByText("Cargar más"));

    // El offset arranca donde acaba la ventana del workspace, no en cero.
    await waitFor(() => expect(getPage).toHaveBeenCalledWith({ data: { offset: 1, limit: 80 } }));
    await waitFor(() => expect(screen.getByText("evento evt_viejo_0")).toBeTruthy());
    expect(screen.getByText("evento evt_viejo_1")).toBeTruthy();
    // Ya está entero: el botón desaparece en vez de pedir una página vacía.
    await waitFor(() => expect(screen.queryByText("Cargar más")).toBeNull());
  });

  it("no pinta el aviso cuando la ventana ya es todo el registro", async () => {
    state.ws = {
      me: { name: "Propietario local", role: "ADMIN" as const },
      experts: [],
      activity: [event("evt_a"), event("evt_b")],
      activityTotal: 2,
    };
    render(<ActivityPage />);

    expect(screen.getByText("2 de 2 eventos")).toBeTruthy();
    expect(screen.queryByText(/Se listan los/)).toBeNull();
    expect(screen.queryByText("Cargar más")).toBeNull();
  });

  it("concuerda en singular cuando el registro tiene un solo evento", async () => {
    state.ws = {
      me: { name: "Propietario local", role: "ADMIN" as const },
      experts: [],
      activity: [event("evt_unico")],
      activityTotal: 1,
    };
    render(<ActivityPage />);

    expect(screen.getByText("1 de 1 evento")).toBeTruthy();
    expect(screen.queryByText("1 de 1 eventos")).toBeNull();
  });
});
