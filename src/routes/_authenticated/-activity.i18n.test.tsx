// @vitest-environment jsdom
// SPDX-License-Identifier: MIT
// El registro pinta dos valores que vienen de la base —el tipo del evento y su
// estado— y los dos son datos, no textos de la interfaz: la base guarda
// «Consulta» y «pending» en las dos lenguas y lo que cambia con el idioma es lo
// que se pinta. El tipo salía crudo (no pasaba por `t()`, así que en inglés se
// leía «Consulta») y el estado se traducía a pelo del identificador, que en
// inglés acertaba por casualidad y en español dejaba «pending» en una página
// española. Estas pruebas montan la página en las dos lenguas.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

const event = (id: string, type: string, status: string): Row => ({
  id,
  ts: "2026-01-01T00:00:00.000Z",
  actor: "agent",
  actor_name: "Experto",
  type,
  expert_id: "general",
  status,
  summary: `evento ${id}`,
  sources: [],
  duration_ms: null,
  hasSnapshot: false,
  pending: null,
});

type Ws = {
  me: { name: string; role: "ADMIN" };
  experts: { id: string; name: string }[];
  activity: unknown[];
  activityTotal: number;
};

const { state, locale, getPage } = vi.hoisted(() => ({
  state: {
    ws: {
      me: { name: "Propietario local", role: "ADMIN" as const },
      experts: [] as { id: string; name: string }[],
      activity: [] as unknown[],
      activityTotal: 0,
    } as Ws,
  },
  locale: { current: "en" as "en" | "es" },
  getPage: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => () => ({}) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
// El traductor de verdad, con el diccionario del repo: lo que se prueba es lo
// que leería una persona, no un doble que se invente las traducciones.
vi.mock("@/lib/i18n", async () => {
  const { translate } = await import("@/lib/translate");
  return {
    useT: () => ({
      locale: locale.current,
      t: (text: string, params?: Record<string, string | number>) =>
        translate(locale.current, text, params),
    }),
  };
});
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

/** La fila del evento: el div que lleva la cabecera y el resumen. */
const rowOf = (id: string) =>
  screen.getByText(`evento ${id}`).parentElement as unknown as HTMLElement;

/**
 * El tipo va en el mismo nodo que el punto que lo separa («· Consulta»), así
 * que no se busca por texto exacto: se mira la fila entera.
 */
const textOf = (id: string) => rowOf(id).textContent ?? "";

const ws = (activity: Row[]): Ws => ({
  me: { name: "Propietario local", role: "ADMIN" },
  experts: [],
  activity,
  activityTotal: activity.length,
});

describe("ActivityPage en las dos lenguas", () => {
  let ActivityPage: (typeof import("./activity"))["ActivityPage"];

  beforeEach(async () => {
    getPage.mockReset();
    locale.current = "en";
    state.ws = ws([]);
    ({ ActivityPage } = await import("./activity"));
  });
  afterEach(cleanup);

  it("traduce el tipo del evento y el estado con la interfaz en inglés", () => {
    state.ws = ws([event("e1", "Consulta", "ok"), event("e2", "Seguridad", "pending")]);
    render(<ActivityPage />);

    expect(textOf("e1")).toContain("Query");
    expect(textOf("e2")).toContain("Security");
    // El estado sale de su etiqueta («Hecho»), no del identificador crudo.
    expect(within(rowOf("e1")).getByText("Done")).toBeTruthy();
    expect(within(rowOf("e2")).getByText("Pending")).toBeTruthy();
    // Ni un rastro del valor de la base en la fila.
    expect(textOf("e1")).not.toContain("Consulta");
    expect(textOf("e1")).not.toContain("ok");
  });

  it("traduce los seis estados del desplegable", () => {
    render(<ActivityPage />);
    const status = screen.getAllByRole("combobox")[3] as HTMLSelectElement;
    const labels = within(status)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toEqual([
      "All statuses",
      "Done",
      "Pending",
      "Reverted",
      "Denied",
      "Failed",
      "Cancelled",
    ]);
  });

  it("filtra por el valor de la base aunque la opción se lea traducida", () => {
    state.ws = ws([event("e1", "Consulta", "ok"), event("e2", "Seguridad", "pending")]);
    render(<ActivityPage />);

    // El texto es el traducido y el valor sigue siendo el dato: si el `value`
    // se quedara en el texto, el filtro compararía «Query» con «Consulta».
    const option = screen.getByRole("option", { name: "Query" }) as HTMLOptionElement;
    expect(option.value).toBe("Consulta");

    const type = screen.getAllByRole("combobox")[1] as HTMLSelectElement;
    fireEvent.change(type, { target: { value: "Consulta" } });

    expect(screen.getByText("evento e1")).toBeTruthy();
    expect(screen.queryByText("evento e2")).toBeNull();
  });

  it("en español el tipo sigue como está y el estado deja de ser un código inglés", () => {
    locale.current = "es";
    state.ws = ws([event("e1", "Configuración", "reverted")]);
    render(<ActivityPage />);

    expect(textOf("e1")).toContain("Configuración");
    expect(within(rowOf("e1")).getByText("Revertido")).toBeTruthy();
    expect(textOf("e1")).not.toContain("reverted");
  });
});
