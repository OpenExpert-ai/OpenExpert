// SPDX-License-Identifier: MIT
// La capa que convierte la selección en un modelo del SDK. Lo que se fija aquí
// es de quién es la clave: cada adaptador lee la variable de su proveedor, y
// ninguna sustituye la que falta por la de otro.
import { afterEach, describe, expect, it } from "vitest";

import { getLanguageModel, providerHeaders, selectedProvider } from "./model-provider.server";
import { providerDef } from "@openexpert/opencore/model-provider";

type Built = { modelId?: string; provider?: string };

const ENV = [
  "OPENEXPERT_MODEL_PROVIDER",
  "OPENEXPERT_MODEL_ID",
  "OPENEXPERT_BASE_URL",
  "OPENEXPERT_MODEL_KEY",
  "OPENCODE_GO_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "OLLAMA_BASE_URL",
];

const original = new Map(ENV.map((k) => [k, process.env[k]]));

function setEnv(values: Record<string, string>): void {
  for (const k of ENV) delete process.env[k];
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
}

afterEach(() => {
  for (const [k, v] of original) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("getLanguageModel", () => {
  it("construye el modelo de Anthropic con la clave de Anthropic", () => {
    setEnv({
      OPENEXPERT_MODEL_PROVIDER: "anthropic",
      OPENEXPERT_MODEL_ID: "claude-sonnet-4-5",
      ANTHROPIC_API_KEY: "sk-ant",
    });
    const model = getLanguageModel() as Built;
    expect(model.modelId).toBe("claude-sonnet-4-5");
    expect(model.provider).toContain("anthropic");
  });

  it("no construye Anthropic con la clave de otro proveedor: dice cuál falta", () => {
    setEnv({
      OPENEXPERT_MODEL_PROVIDER: "anthropic",
      OPENEXPERT_MODEL_ID: "claude-sonnet-4-5",
      OPENEXPERT_MODEL_KEY: "sk-del-endpoint-generico",
      OPENCODE_GO_API_KEY: "sk-opencode",
    });
    expect(() => getLanguageModel()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("Anthropic sin dirección en el catálogo no se inventa una", () => {
    // El registro la trae; si algún día no la trajera, el adaptador usa la suya
    // en vez de apuntar a un sitio equivocado.
    expect(providerDef("anthropic")?.baseUrl).toBe("https://api.anthropic.com/v1");
  });

  it("construye Google con la clave de Gemini", () => {
    setEnv({
      OPENEXPERT_MODEL_PROVIDER: "google",
      OPENEXPERT_MODEL_ID: "gemini-2.5-flash",
      GOOGLE_API_KEY: "AIza",
    });
    const model = getLanguageModel() as Built;
    expect(model.modelId).toBe("gemini-2.5-flash");
    expect(selectedProvider()).toBe("google");
  });

  it("sin clave de Gemini lo dice, en vez de tirar de la de otro", () => {
    setEnv({ OPENEXPERT_MODEL_PROVIDER: "google", ANTHROPIC_API_KEY: "sk-ant" });
    expect(() => getLanguageModel()).toThrow(/GOOGLE_API_KEY/);
  });

  it("el endpoint genérico usa su propia dirección y su propia clave", () => {
    setEnv({
      OPENEXPERT_MODEL_PROVIDER: "openai-compatible",
      OPENEXPERT_MODEL_ID: "gpt-4o-mini",
      OPENEXPERT_BASE_URL: "https://api.example.com/v1",
      OPENEXPERT_MODEL_KEY: "sk-propia",
    });
    expect((getLanguageModel() as Built).modelId).toBe("gpt-4o-mini");
  });

  it("sin dirección para el endpoint genérico, falla nombrando la variable", () => {
    setEnv({
      OPENEXPERT_MODEL_PROVIDER: "openai-compatible",
      OPENEXPERT_MODEL_ID: "gpt-4o-mini",
      OPENEXPERT_MODEL_KEY: "sk-propia",
    });
    expect(() => getLanguageModel()).toThrow(/OPENEXPERT_BASE_URL/);
  });

  it("Ollama no necesita clave y usa su endpoint normalizado", () => {
    setEnv({ OPENEXPERT_MODEL_PROVIDER: "ollama", OPENEXPERT_MODEL_ID: "llama3.1" });
    expect((getLanguageModel() as Built).modelId).toBe("llama3.1");
  });
});

describe("providerHeaders", () => {
  it("identifica la aplicación en lugar de llegar como un SDK anónimo", () => {
    const def = providerDef("anthropic")!;
    expect(providerHeaders(def)["user-agent"]).toMatch(/^OpenExpert\//);
  });

  it("nombra la conversación cuando el proveedor la pide: sin esto hay puertas que responden 400", () => {
    expect(providerHeaders(providerDef("opencode-go")!, "conv-123")["x-opencode-session"]).toBe(
      "conv-123",
    );
  });

  it("no se la manda a quien no la pide, ni la inventa cuando no hay sesión", () => {
    expect(providerHeaders(providerDef("opencode-go")!)).not.toHaveProperty("x-opencode-session");
    expect(providerHeaders(providerDef("opencode-go")!, "")).not.toHaveProperty(
      "x-opencode-session",
    );
    expect(providerHeaders(providerDef("anthropic")!, "conv-1")).not.toHaveProperty(
      "x-opencode-session",
    );
  });
});
