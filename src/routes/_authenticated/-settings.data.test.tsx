// @vitest-environment jsdom
// SPDX-License-Identifier: MIT
// El aviso de la importación de CSV tiene que decir cuántas filas se cayeron.
// El servidor devuelve `skipped` con el recuento real y `errors` recortado a las
// 20 primeras (`business.functions.ts`), así que contar `errors.length` esconde
// el resto: con 45 filas rechazadas el panel dice «20 fila(s) con error» y el
// usuario no tiene forma de saber que perdió 25 por el camino. Ese aviso es lo
// único que le dice qué entró en el panel, y es con lo que decide si vuelve a
// preparar el fichero.
//
// El otro lado del mismo aviso: un fichero que no importa nada no puede
// anunciarse primero como «Importados 0 registros», en verde.

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
  info: vi.fn(),
}));

const businessFns = vi.hoisted(() => ({
  clearDemo: vi.fn(),
  getBusinessDataStatus: vi.fn(),
  importBusinessCsv: vi.fn(),
  loadDemo: vi.fn(),
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@tanstack/react-router", () => ({
  // La ruta se queda en su configuración: de ahí sale el componente de la página.
  createFileRoute: () => (config: unknown) => config,
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => {
    const call = () => () => ({});
    return Object.assign(call, {
      validator: () => call,
      handler: () => call,
      middleware: () => call,
    });
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// `t` interpola los parámetros como el de verdad; sin traducción, para que la
// aserción hable del número y no del idioma.
vi.mock("@/lib/i18n", () => ({
  useT: () => ({
    t: (text: string, params?: Record<string, unknown>) =>
      params
        ? text.replace(/\{(\w+)\}/g, (_all: string, key: string) => String(params[key] ?? ""))
        : text,
    locale: "es" as const,
  }),
}));

vi.mock("@/lib/settings.functions", () => ({
  clearChatHistory: vi.fn(),
  exportEncryptedBackup: vi.fn(),
  getDataStats: vi.fn(),
  importBackup: vi.fn(),
  resetData: vi.fn(),
  vacuumDb: vi.fn(),
}));

vi.mock("@/lib/business.functions", () => businessFns);

vi.mock("@/lib/connectors.functions", () => ({
  connectHolded: vi.fn(),
  connectPipedrive: vi.fn(),
  disconnectConnector: vi.fn(),
  getConnectorStatus: vi.fn(),
  syncConnector: vi.fn(),
}));

/** Las filas rechazadas que el servidor manda como muestra recortada. */
const sampleErrors = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    row: i + 2,
    message: "El campo amount (importe) no es un número: «no-es-un-numero».",
  }));

/** Un fichero con el texto ya resuelto: `onCsv` empieza leyéndolo. */
function csvFile(content: string): File {
  const file = new File([content], "facturas.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", { value: async () => content });
  return file;
}

/** Monta la página y devuelve el campo de «Importar CSV». */
async function mountPage(): Promise<HTMLInputElement> {
  const mod = await import("./settings.data");
  const Page = (mod.Route as unknown as { component: () => React.ReactElement }).component;
  const { container } = render(<Page />);
  const input = container.querySelector('input[accept*="csv"]');
  if (!input) throw new Error("La página no pinta el campo de importar CSV");
  return input as HTMLInputElement;
}

async function importCsv(input: HTMLInputElement, content: string) {
  const file = csvFile(content);
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
  await waitFor(() => expect(businessFns.importBusinessCsv).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  businessFns.importBusinessCsv.mockResolvedValue({
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  });
});

afterEach(cleanup);

describe("importación de CSV: el recuento de filas rechazadas", () => {
  it("dice las 45 que se cayeron, no las 20 que caben en el detalle", async () => {
    // El servidor manda `skipped` entero y `errors` recortado a 20.
    businessFns.importBusinessCsv.mockResolvedValue({
      inserted: 2,
      updated: 0,
      skipped: 45,
      errors: sampleErrors(20),
    });
    const input = await mountPage();
    await importCsv(input, "client,amount,dueDate\n");
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    const message = String(toast.warning.mock.calls[0]?.[0] ?? "");
    expect(message).toContain("45");
  });

  it("un fichero que no importa nada no se anuncia como importado", async () => {
    businessFns.importBusinessCsv.mockResolvedValue({
      inserted: 0,
      updated: 0,
      skipped: 45,
      errors: sampleErrors(20),
    });
    const input = await mountPage();
    await importCsv(input, "client,amount,dueDate\n");
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("una importación con filas buenas y dos malas cuenta las dos", async () => {
    businessFns.importBusinessCsv.mockResolvedValue({
      inserted: 3,
      updated: 1,
      skipped: 2,
      errors: sampleErrors(2),
    });
    const input = await mountPage();
    await importCsv(input, "client,amount,dueDate\n");
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(String(toast.warning.mock.calls[0]?.[0] ?? "")).toContain("2");
    expect(toast.success).toHaveBeenCalled();
  });
});
