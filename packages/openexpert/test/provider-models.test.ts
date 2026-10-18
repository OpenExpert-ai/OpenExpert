// SPDX-License-Identifier: MIT
// `listProviderModels` is the single way to ask a provider what it serves, and
// the settings panel and the CLI both go through it. What is pinned here is the
// protocol of each adapter — above all that Anthropic's key travels in its own
// header and never in another provider's slot.
import { describe, expect, it, vi } from "vitest";

import { listProviderModels } from "../src/provider-models.js";

type Call = { url: string; init?: RequestInit };

function stubFetch(response: unknown, status = 200): { calls: Call[]; impl: typeof fetch } {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), ...(init ? { init } : {}) });
    return new Response(JSON.stringify(response), { status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe("listProviderModels", () => {
  it("pregunta a Anthropic con su propia cabecera de clave", async () => {
    const { calls, impl } = stubFetch({ data: [{ id: "claude-sonnet-4-5" }] });
    const res = await listProviderModels("anthropic", {
      env: { ANTHROPIC_API_KEY: "sk-ant" },
      fetchImpl: impl,
    });
    expect(res).toEqual({ ok: true, models: ["claude-sonnet-4-5"], source: "endpoint" });
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/models?limit=100");
    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    // Ni una pista del esquema de otro proveedor.
    expect(headers.Authorization).toBeUndefined();
  });

  it("no usa la clave de otro proveedor aunque esté puesta", async () => {
    // La regresión que originó todo esto: con una sola ranura compartida, la
    // clave del endpoint genérico acababa autenticando contra Anthropic.
    const res = await listProviderModels("anthropic", { env: { OPENEXPERT_MODEL_KEY: "sk-otro" } });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(res.source).toBe("catalogue");
    // Y sigue ofreciendo lo que conoce, para no dejar al usuario sin opciones.
    expect(res.models).toContain("claude-sonnet-4-5");
  });

  it("para el endpoint genérico usa el Bearer y la URL guardada", async () => {
    const { calls, impl } = stubFetch({ data: [{ id: "gpt-4o-mini" }] });
    const res = await listProviderModels("openai-compatible", {
      env: {
        OPENEXPERT_MODEL_KEY: "sk-xyz",
        OPENEXPERT_BASE_URL: "https://api.example.com/v1/",
      },
      fetchImpl: impl,
    });
    expect(res.models).toEqual(["gpt-4o-mini"]);
    expect(calls[0]!.url).toBe("https://api.example.com/v1/models");
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe("Bearer sk-xyz");
  });

  it("acepta un endpoint que aún no se ha guardado", async () => {
    const { calls, impl } = stubFetch({ data: [] });
    await listProviderModels("openai-compatible", {
      env: { OPENEXPERT_MODEL_KEY: "k" },
      endpoint: "http://localhost:9999/v1",
      fetchImpl: impl,
    });
    expect(calls[0]!.url).toBe("http://localhost:9999/v1/models");
  });

  it("Ollama usa su endpoint nativo y no pide clave", async () => {
    const { calls, impl } = stubFetch({ models: [{ name: "llama3.1" }] });
    const res = await listProviderModels("ollama", { env: {}, fetchImpl: impl });
    expect(res.models).toEqual(["llama3.1"]);
    expect(calls[0]!.url).toBe("http://localhost:11434/api/tags");
  });

  it("Google filtra lo que no puede conversar y quita el prefijo del nombre", async () => {
    const { calls, impl } = stubFetch({
      models: [
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
        { name: "models/sin-metodos" },
      ],
    });
    const res = await listProviderModels("google", {
      env: { GOOGLE_API_KEY: "AIza" },
      fetchImpl: impl,
    });
    expect(res.models).toEqual(["gemini-2.5-flash", "sin-metodos"]);
    expect(calls[0]!.url).toContain("key=AIza");
  });

  it("sin clave de Google lo dice, en vez de preguntar a otro sitio", async () => {
    const res = await listProviderModels("google", { env: {} });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/GOOGLE_API_KEY/);
  });

  it("una respuesta de Google sin lista deja la lista vacía", async () => {
    const { impl } = stubFetch({});
    expect(
      await listProviderModels("google", { env: { GOOGLE_API_KEY: "k" }, fetchImpl: impl }),
    ).toMatchObject({ ok: true, models: [] });
  });

  it("un endpoint que no contesta no se calla: dice qué pasó", async () => {
    const res = await listProviderModels("openai-compatible", {
      env: { OPENEXPERT_MODEL_KEY: "k", OPENEXPERT_BASE_URL: "https://api.example.com/v1" },
      fetchImpl: vi.fn(async () => Promise.reject(new Error("down"))) as unknown as typeof fetch,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/No se pudo preguntar a Compatible con OpenAI/);
  });

  it("y una respuesta HTTP de error tampoco", async () => {
    const { impl } = stubFetch({ error: "nope" }, 401);
    const res = await listProviderModels("anthropic", {
      env: { ANTHROPIC_API_KEY: "sk-ant" },
      fetchImpl: impl,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Anthropic respondió 401");
  });

  it("un proveedor que no está en el catálogo no revienta", async () => {
    const res = await listProviderModels("nope" as never, {});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Proveedor desconocido/);
  });

  it("al endpoint genérico sin URL le falta la dirección, y lo dice", async () => {
    const res = await listProviderModels("openai-compatible", {
      env: { OPENEXPERT_MODEL_KEY: "k" },
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Falta la dirección/);
  });

  it("un error HTTP de cada adaptador se cuenta con su nombre", async () => {
    const cases: [string, NodeJS.ProcessEnv, RegExp][] = [
      ["google", { GOOGLE_API_KEY: "k" }, /Google respondió 500/],
      [
        "openai-compatible",
        { OPENEXPERT_MODEL_KEY: "k", OPENEXPERT_BASE_URL: "https://api.example.com/v1" },
        /El endpoint respondió 500/,
      ],
      ["ollama", {}, /Ollama respondió 500/],
    ];
    for (const [id, env, expected] of cases) {
      const { impl } = stubFetch({ error: "boom" }, 500);
      const res = await listProviderModels(id as never, { env, fetchImpl: impl });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(expected);
      expect(res.source).toBe("endpoint");
    }
  });

  it("un nombre de modelo sin listar no rompe la respuesta", async () => {
    // Endpoints que contestan con otra forma: sin `models`/`data`, la lista es
    // vacía y el panel sigue funcionando con lo que conoce el catálogo.
    const { impl } = stubFetch({ nada: true });
    expect(
      await listProviderModels("openai-compatible", {
        env: { OPENEXPERT_MODEL_KEY: "k", OPENEXPERT_BASE_URL: "https://api.example.com/v1" },
        fetchImpl: impl,
      }),
    ).toMatchObject({ ok: true, models: [] });
  });

  it("una respuesta sin lista tampoco rompe a Anthropic ni a Ollama", async () => {
    const vacio = stubFetch({});
    expect(
      await listProviderModels("anthropic", {
        env: { ANTHROPIC_API_KEY: "k" },
        fetchImpl: vacio.impl,
      }),
    ).toMatchObject({ ok: true, models: [] });
    expect(await listProviderModels("ollama", { env: {}, fetchImpl: vacio.impl })).toMatchObject({
      ok: true,
      models: [],
    });
  });

  it("un Ollama que no está en marcha lo dice, y ofrece lo que conoce", async () => {
    const res = await listProviderModels("ollama", {
      env: {},
      fetchImpl: vi.fn(async () =>
        Promise.reject(new Error("ECONNREFUSED")),
      ) as unknown as typeof fetch,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/No se pudo contactar con Ollama/);
    expect(res.source).toBe("catalogue");
    expect(res.models).toContain("llama3.1");
  });
});
