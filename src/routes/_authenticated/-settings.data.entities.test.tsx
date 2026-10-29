// @vitest-environment jsdom
// SPDX-License-Identifier: MIT
// El panel de datos pinta los contadores de una integración con
// `current.entities.map((e) => \`${e.name}: ${e.count}\`)` (settings.data.tsx:585),
// sin pasar por `t()`: el nombre no es una etiqueta de la interfaz, es un dato
// que se escribió al sincronizar. Y cada escritor lo escribe en su idioma —
// «Documentos», «Hojas de cálculo» y «Carpetas» (summarizeGrants y las carpetas
// locales), «Facturas» (Holded), «Deals» (Pipedrive, en inglés dentro de una app
// que llama «Ventas» a esa misma tabla)—, así que con la interfaz en inglés una
// conexión de Drive anuncia «Documentos: 12» y en castellano la de Pipedrive
// anuncia «Deals: 120».
//
// Lo que se fija aquí es el contrato del panel: con la interfaz en inglés las
// entidades conocidas salen en inglés, y un nombre que no es etiqueta conocida
// —el de un espacio de Notion es dato del usuario— se pinta tal cual.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Lo que el panel recibe de `getConnectorStatus`, con los nombres que escribe cada sincronización. */
const connectors = vi.hoisted(() => [
  {
    id: "holded",
    connected: true,
    configured: true,
    lastSync: null,
    entities: [
      { name: "Facturas", count: 4 },
      { name: "Carpetas", count: 2 },
      { name: "Documentos", count: 1 },
      { name: "Acme Corp", count: 7 },
    ],
  },
]);

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn() },
}));

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
  useQuery: ({ queryKey }: { queryKey: unknown[] }) =>
    queryKey[0] === "connectors" ? { data: connectors } : { data: undefined },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// El `t` de verdad, con el diccionario de verdad y la interfaz en inglés: la
// aserción tiene que hablar del idioma que ve el usuario, no de un doble.
vi.mock("@/lib/i18n", async () => {
  const { translate } = await import("@/lib/translate");
  return {
    useT: () => ({
      t: (text: string, params?: Record<string, string | number>) => translate("en", text, params),
      locale: "en" as const,
    }),
  };
});

vi.mock("@/lib/settings.functions", () => ({
  clearChatHistory: vi.fn(),
  exportEncryptedBackup: vi.fn(),
  getDataStats: vi.fn(),
  importBackup: vi.fn(),
  resetData: vi.fn(),
  vacuumDb: vi.fn(),
}));

vi.mock("@/lib/business.functions", () => ({
  clearDemo: vi.fn(),
  getBusinessDataStatus: vi.fn(),
  importBusinessCsv: vi.fn(),
  loadDemo: vi.fn(),
}));

vi.mock("@/lib/connectors.functions", () => ({
  connectHolded: vi.fn(),
  connectPipedrive: vi.fn(),
  disconnectConnector: vi.fn(),
  getConnectorStatus: vi.fn(),
  syncConnector: vi.fn(),
}));

async function mountPage(): Promise<string> {
  const mod = await import("./settings.data");
  const Page = (mod.Route as unknown as { component: () => React.ReactElement }).component;
  const { container } = render(<Page />);
  return container.textContent ?? "";
}

afterEach(cleanup);

describe("panel de datos: las entidades sincronizadas y el idioma de la interfaz", () => {
  it("con la interfaz en inglés dice Invoices y Folders, no las palabras guardadas en castellano", async () => {
    const text = await mountPage();
    expect(text).toContain("Invoices: 4");
    expect(text).toContain("Folders: 2");
    expect(text).toContain("Documents: 1");
    expect(text).not.toContain("Facturas");
    expect(text).not.toContain("Carpetas");
    expect(text).not.toContain("Documentos");
  });

  it("un nombre que no es etiqueta conocida se pinta tal cual, sin traducirlo", async () => {
    // El nombre de un espacio de Notion es dato del usuario: cambiarlo sería
    // mentir sobre lo que hay conectado.
    const text = await mountPage();
    expect(text).toContain("Acme Corp: 7");
  });
});
