// @vitest-environment jsdom
// SPDX-License-Identifier: MIT
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
}));

vi.mock("@/lib/i18n", () => ({
  useT: () => ({ t: (s: string) => s, locale: "es" as const }),
}));

vi.mock("@/lib/store", () => ({
  useWorkspace: () => ({
    data: {
      integrations: [
        { id: "gdrive", name: "Google Drive", connected: true },
        { id: "local", name: "Archivos locales", connected: false },
      ],
    },
  }),
  useAct: () => ({ mutate, isPending: false }),
  useUI: () => ({ activeExpert: "general", setActiveExpert: vi.fn() }),
}));

vi.mock("@/lib/data.functions", () => ({
  createExpert: {},
  updateExpert: {},
  deleteExpert: {},
}));

describe("ExpertForm", () => {
  beforeEach(() => mutate.mockClear());
  afterEach(cleanup);

  it("creates an Expert with the selected domains", async () => {
    const { ExpertForm } = await import("./experts");
    render(<ExpertForm onDone={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Nombre (p. ej. Operaciones)"), {
      target: { value: "Operaciones" },
    });
    fireEvent.click(screen.getByText("Ventas"));
    fireEvent.click(screen.getByText("Finanzas"));
    fireEvent.click(screen.getByText("Crear Experto"));

    expect(mutate).toHaveBeenCalledOnce();
    const arg = mutate.mock.calls[0]![0] as { data: { name: string; domains: string[] } };
    expect(arg.data.name).toBe("Operaciones");
    expect([...arg.data.domains].sort()).toEqual(["finanzas", "ventas"]);
  });

  it("edits an Expert and keeps its id", async () => {
    const { ExpertForm } = await import("./experts");
    render(
      <ExpertForm
        expertId="ventas"
        initialName="Ventas"
        initialDesc="CRM"
        initialDomains={["ventas"]}
        initialSources={["gdrive"]}
        onDone={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Cuentas / churn"));
    fireEvent.click(screen.getByText("Guardar cambios"));

    expect(mutate).toHaveBeenCalledOnce();
    const arg = mutate.mock.calls[0]![0] as { data: { id: string; domains: string[] } };
    expect(arg.data.id).toBe("ventas");
    expect([...arg.data.domains].sort()).toEqual(["clientes", "ventas"]);
  });
});
