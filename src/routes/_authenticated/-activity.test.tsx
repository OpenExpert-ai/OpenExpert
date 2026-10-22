// @vitest-environment jsdom
// SPDX-License-Identifier: MIT
// La pantalla del registro de actividad.
//
// La página recibía los 300 eventos más recientes y pintaba «{a} / {b}
// eventos» con `b = ws.activity.length`: el número de la ventana, presentado
// como el total del registro. Con 305 eventos en la base la pantalla decía
// «300 eventos» y no había manera de llegar a los cinco últimos —ni de
// leerlos, ni de revertir su snapshot.
//
// Ahora la página pide la ventana al servidor (`listActivity`), dice el total
// real y camina hacia los eventos antiguos con «Cargar más».
//
// La página se monta con las funciones de servidor dobladas, así que lo que
// se comprueba es lo que la pantalla **pide** y lo que **enseña**.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ list: [] as unknown[][] }));

const serverFns = vi.hoisted(() => ({
  listActivity: vi.fn(),
  decideAction: vi.fn(),
  revertEvent: vi.fn(),
}));

// `createFileRoute` devuelve la función que recibe las opciones de la ruta;
// aquí se guarda tal cual para poder montar el componente y leer la
// cabecera que la ruta declara.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

// `useInfiniteQuery` se dobla con un `useState` + `useEffect`: la consulta es
// asíncrona, así que el doble tiene que resolver la promesa y volver a
// pintar cuando llega. La clave de la consulta es la dependencia, que es lo
// que hace que un cambio de filtro vuelva a preguntar al servidor.
//
// La función de la consulta se guarda en una ref y no en las dependencias:
// el doble imita a `useInfiniteQuery`, que vuelve a preguntar cuando cambia
// la clave, no cuando cambia la función.
vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: ({
    queryFn,
    queryKey,
    initialPageParam,
    getNextPageParam,
  }: {
    queryFn: (ctx: { pageParam: number }) => unknown;
    queryKey: unknown;
    initialPageParam: number;
    getNextPageParam: (last: { nextOffset: number | null }) => number | null;
  }) => {
    const [pages, setPages] = useState<unknown[]>([]);
    const latest = useRef(queryFn);
    latest.current = queryFn;
    const next = useRef(getNextPageParam);
    next.current = getNextPageParam;
    const first = useRef(initialPageParam);
    first.current = initialPageParam;
    const key = JSON.stringify(queryKey);
    useEffect(() => {
      let alive = true;
      void Promise.resolve(latest.current({ pageParam: first.current })).then((value) => {
        if (alive) setPages([value]);
      });
      return () => {
        alive = false;
      };
    }, [key]);
    const last = pages[pages.length - 1] as { nextOffset: number | null } | undefined;
    return {
      data: pages.length ? { pages } : undefined,
      isLoading: pages.length === 0,
      error: null,
      hasNextPage: !!last && next.current(last) !== null,
      isFetchingNextPage: false,
      fetchNextPage: async () => {
        if (!last) return;
        const param = next.current(last);
        if (param === null) return;
        const value = await latest.current({ pageParam: param });
        setPages((p) => [...p, value]);
      },
    };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// El `t` real sustituye los `{parámetros}`; el doble hace lo mismo, porque la
// cifra de la cabecera viene de ahí.
vi.mock("@/lib/i18n", () => ({
  useT: () => ({
    t: (s: string, params?: Record<string, string | number>) =>
      params
        ? s.replace(/\{(\w+)\}/g, (_, key: string) =>
            key in params ? String(params[key]) : `{${key}}`,
          )
        : s,
    locale: "es" as const,
  }),
}));

vi.mock("@/lib/store", () => ({
  useWorkspace: () => ({
    data: {
      me: { name: "Propietario local", role: "ADMIN" },
      experts: [{ id: "general", name: "General" }],
      activity: [{ id: "evt_1", type: "Configuración" }],
    },
  }),
  useMe: () => ({ name: "Propietario local", role: "ADMIN" }),
  useAct: () => ({ mutate: vi.fn(), isPending: false }),
  // La línea de cada evento pinta la fecha con esta función.
  fmtTime: (iso: string) => iso,
}));

vi.mock("@/lib/data.functions", () => serverFns);

const event = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  ts: "2026-01-01T00:00:00.000Z",
  actor: "human",
  actor_name: "Propietario local",
  type: "Configuración",
  expert_id: "general",
  status: "ok",
  summary: `Evento ${id}`,
  sources: [],
  duration_ms: null,
  hasSnapshot: false,
  pending: null,
  ...over,
});

beforeEach(() => {
  calls.list.length = 0;
  serverFns.listActivity.mockImplementation(async (opts: unknown) => {
    calls.list.push([opts]);
    const data = (opts as { data: { offset?: number } }).data;
    const offset = data.offset ?? 0;
    return {
      events: [event(`evt_${304 - offset}`), event(`evt_${303 - offset}`)],
      total: 305,
      returned: 2,
      hasMore: offset + 2 < 305,
      nextOffset: offset + 2 < 305 ? offset + 2 : null,
    };
  });
});

afterEach(cleanup);

async function mountPage() {
  const { Route } = await import("./activity");
  const options = Route as unknown as {
    head: () => { meta: { name?: string; content?: string }[] };
    component: () => React.ReactElement;
  };
  render(<options.component />);
  await waitFor(() => expect(screen.getByText("evt_304")).toBeTruthy());
  return options;
}

describe("la pantalla del registro de actividad", () => {
  it("enseña el total real del registro, no el tamaño de la ventana", async () => {
    await mountPage();
    // 2 eventos en pantalla de 305 en el registro: el número que se pinta es
    // el total, que viene del COUNT(*) del servidor.
    expect(screen.getByText("2 de 305 eventos")).toBeTruthy();
  });

  it("pide la primera ventana al servidor", async () => {
    await mountPage();
    expect(calls.list.length).toBe(1);
    const data = (calls.list[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data["limit"]).toBe(40);
    expect(data["offset"]).toBe(0);
  });

  it("al pulsar «Cargar más» pide la ventana siguiente, no una más grande", async () => {
    // La ventana no crece: crece el desplazamiento. Pedir «todo lo que
    // haya cargado hasta ahora» acabaría pidiendo más eventos de los que
    // el servidor acepta en una llamada, y la lista se quedaría vacía.
    await mountPage();
    fireEvent.click(screen.getByText("Cargar más"));
    await waitFor(() => expect(calls.list.length).toBe(2));
    const data = (calls.list[1]?.[0] as { data: Record<string, unknown> }).data;
    expect(data["limit"]).toBe(40);
    expect(data["offset"]).toBe(2);
  });

  it("manda los filtros al servidor, no los aplica en el navegador", async () => {
    await mountPage();
    fireEvent.change(screen.getByLabelText("Todos los actores"), { target: { value: "agent" } });
    await waitFor(() => expect(calls.list.length).toBe(2));
    const data = (calls.list[1]?.[0] as { data: Record<string, unknown> }).data;
    expect(data["actor"]).toBe("agent");
  });

  it("busca en el servidor con el término escrito", async () => {
    await mountPage();
    fireEvent.change(screen.getByPlaceholderText("Buscar en el registro…"), {
      target: { value: "operaciones" },
    });
    await waitFor(() => expect(calls.list.length).toBe(2));
    const data = (calls.list[1]?.[0] as { data: Record<string, unknown> }).data;
    expect(data["q"]).toBe("operaciones");
  });

  it("no dice que el registro es completo", async () => {
    const options = await mountPage();
    // La página se anunciaba como «Auditoría completa de acciones humanas y
    // de agentes con reversión por snapshots». Con la ventana en el sitio
    // correcto ya no se anuncia como completa: la ventana es una ventana.
    const description = options.head().meta.find((m) => m.name === "description")?.content;
    expect(description).not.toContain("completa");
    expect(description).toContain("Auditoría de acciones humanas");
  });
});
