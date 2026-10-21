// @vitest-environment jsdom
// SPDX-License-Identifier: MIT
// "Probar conexión" y "Listar" tienen que preguntar por lo que hay escrito
// en el formulario, no por lo que está guardado en disco.
//
// El panel guarda el proveedor, el endpoint y la clave en su propio estado y
// solo los escribe cuando se pulsa "Guardar cambios", así que antes los dos
// botones hablaban de la configuración guardada: se elegía otro proveedor, se
// escribía una clave y el aviso era del anterior —con una clave equivocada
// incluso podía decir "Conexión correcta", porque la vieja seguía en disco.
//
// La página se monta con las funciones de servidor dobladas, así que lo que
// se comprueba es lo que el botón **manda**: el proveedor elegido, el
// endpoint escrito y la clave escrita.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ test: [] as unknown[][], list: [] as unknown[][] }));

const serverFns = vi.hoisted(() => ({
  getSettings: vi.fn(),
  listModels: vi.fn(),
  revealSecret: vi.fn(),
  testProvider: vi.fn(),
  updateAiSettings: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
}));

// `useServerFn` devuelve la propia función: con las de servidor dobladas, la
// página llama directamente a la que la prueba espía.
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  // `AppShell` arrastra el almacén, que llama a sus propias funciones de
  // servidor: aquí solo se necesita el estilo de sus clases.
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
  useQuery: () => ({ data: settingsFixture }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/i18n", () => ({
  useT: () => ({ t: (s: string) => s, locale: "es" as const }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/settings.functions", () => serverFns);

const settingsFixture = {
  ai: {
    provider: "openai-compatible",
    modelId: "mi-modelo",
    ai: { temperature: 0.5, topP: 1, maxOutputTokens: 4096 },
  },
  providers: [
    {
      id: "openai-compatible",
      name: "Compatible con OpenAI (BYOK)",
      adapter: "openai-compatible",
      note: "Tu propio endpoint.",
      keyUrl: null,
      baseUrlHint: null,
      key: { name: "OPENEXPERT_MODEL_KEY", set: true, source: "secrets" },
      endpoint: {
        fixed: null,
        env: "OPENEXPERT_BASE_URL",
        value: "https://guardado.test/v1",
        inUse: "https://guardado.test/v1",
        fallback: null,
      },
      sessionHeader: null,
      models: [],
    },
    {
      id: "google",
      name: "Google Gemini",
      adapter: "google",
      note: "Clave gratuita de AI Studio.",
      keyUrl: null,
      baseUrlHint: null,
      key: { name: "GOOGLE_API_KEY", set: false, source: "default" },
      endpoint: {
        fixed: null,
        env: null,
        value: "",
        inUse: "https://generativelanguage.googleapis.com/v1beta",
        fallback: null,
      },
      sessionHeader: null,
      models: ["gemini-2.5-flash"],
    },
  ],
  paths: { dataDir: "/tmp", config: "/tmp/openexpert.json", secrets: "/tmp/secrets.json" },
  runtime: { version: "0.5.0", node: "v24.0.0", port: "3000" },
};

beforeEach(() => {
  calls.test.length = 0;
  calls.list.length = 0;
  serverFns.getSettings.mockResolvedValue(settingsFixture);
  serverFns.testProvider.mockImplementation(async (opts: unknown) => {
    calls.test.push([opts]);
    return { ok: true, count: 3, error: null, provider: "google", source: "probe" };
  });
  serverFns.listModels.mockImplementation(async (opts: unknown) => {
    calls.list.push([opts]);
    return { ok: true, models: ["m1"], provider: "google", source: "probe" };
  });
  serverFns.revealSecret.mockResolvedValue({ value: null });
  serverFns.updateAiSettings.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

async function mountPanel() {
  const { AiSettings } = await import("./settings.ai");
  render(<AiSettings />);
  await waitFor(() => expect(screen.getByText("Compatible con OpenAI (BYOK)")).toBeTruthy());
  return AiSettings;
}

describe("el panel de modelo e IA", () => {
  it("Probar conexión manda el proveedor, el endpoint y la clave que hay escritos", async () => {
    await mountPanel();

    // Se elige otro proveedor y se escribe su clave, sin guardar nada.
    fireEvent.click(screen.getByText("Google Gemini"));
    fireEvent.change(screen.getByPlaceholderText("GOOGLE_API_KEY"), {
      target: { value: "clave-nueva" },
    });
    fireEvent.click(screen.getByText("Probar conexión"));

    await waitFor(() => expect(calls.test.length).toBe(1));
    expect(calls.test[0]?.[0]).toEqual({
      data: { provider: "google", endpoint: "", key: "clave-nueva" },
    });
  });

  it("Ver modelos manda lo mismo que Probar conexión", async () => {
    await mountPanel();

    fireEvent.click(screen.getByText("Google Gemini"));
    fireEvent.change(screen.getByPlaceholderText("GOOGLE_API_KEY"), {
      target: { value: "clave-nueva" },
    });
    fireEvent.click(screen.getByText("Listar"));

    await waitFor(() => expect(calls.list.length).toBe(1));
    expect(calls.list[0]?.[0]).toEqual({
      data: { provider: "google", endpoint: "", key: "clave-nueva" },
    });
  });

  it("manda el endpoint escrito del proveedor que lo tiene propio", async () => {
    await mountPanel();

    const endpoint = screen.getByPlaceholderText("https://…/v1");
    fireEvent.change(endpoint, { target: { value: "https://nuevo.test/v1" } });
    fireEvent.click(screen.getByText("Probar conexión"));

    await waitFor(() => expect(calls.test.length).toBe(1));
    expect(calls.test[0]?.[0]).toEqual({
      data: { provider: "openai-compatible", endpoint: "https://nuevo.test/v1" },
    });
  });

  it("sin clave escrita no manda ninguna, para que se pregunte por la guardada", async () => {
    await mountPanel();

    fireEvent.click(screen.getByText("Probar conexión"));

    await waitFor(() => expect(calls.test.length).toBe(1));
    expect(calls.test[0]?.[0]).toEqual({
      data: { provider: "openai-compatible", endpoint: "https://guardado.test/v1" },
    });
  });
});
