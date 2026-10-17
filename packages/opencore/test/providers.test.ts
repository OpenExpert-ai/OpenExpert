// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import {
  BYOK_PROVIDERS,
  defaultModelOf,
  endpointOf,
  endpointSourceOf,
  isProviderId,
  keySourceOf,
  providerCatalogue,
  providerKeyEnvOf,
  PROVIDER_IDS,
  PROVIDER_KEY_VARS,
  PROVIDERS,
  providerDef,
  type ModelProviderId,
} from "../src/providers.js";

describe("el catálogo de proveedores", () => {
  it("cada ficha tiene lo mínimo para poder usarse", () => {
    for (const p of PROVIDERS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.adapter).toBeTruthy();
      // No toda ficha declara dirección, y es correcto: Ollama la deja al
      // usuario, el genérico también, y Google usa la del adaptador. Declararla
      // es para los que tienen endpoint propio, y esos sí la llevan.
      const laPoneElUsuario = "baseUrlEnv" in p;
      const usaLaDelAdaptador = p.id === "google";
      if (!laPoneElUsuario && !usaLaDelAdaptador) {
        expect("baseUrl" in p ? p.baseUrl : undefined).toBeTruthy();
      }
    }
  });

  it("no hay dos fichas con el mismo id: el id es la clave de todo lo demás", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("el identificador de proveedor son las fichas, ni una más", () => {
    const ids: ModelProviderId[] = PROVIDERS.map((p) => p.id);
    expect(ids).toHaveLength(PROVIDERS.length);
    expect(ids).toContain("opencode-go");
    expect(ids).toContain("anthropic");
    expect([...PROVIDER_IDS]).toEqual(ids);
    expect(PROVIDER_IDS.length).toBeGreaterThan(0);
    expect(isProviderId("anthropic")).toBe(true);
    expect(isProviderId("nope")).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
  });

  it("la clave sale del catálogo, no de una segunda lista que mantener", () => {
    expect(keySourceOf("google")).toBe("GOOGLE_API_KEY");
    expect(keySourceOf("anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(keySourceOf("opencode-go")).toBe("OPENCODE_GO_API_KEY");
    expect(keySourceOf("ollama")).toBe("none (local)");
    expect([...PROVIDER_KEY_VARS]).toEqual([
      "GOOGLE_API_KEY",
      "ANTHROPIC_API_KEY",
      "OPENEXPERT_MODEL_KEY",
      "OPENCODE_GO_API_KEY",
    ]);
  });

  it("**dos proveedores no comparten la variable de su clave**", () => {
    // Compartirla significa que guardar la clave de uno borra la del otro, y el
    // fallo no se ve hasta que el otro proveedor deja de autenticar. Es la
    // razón de ser de este catálogo: una clave por proveedor, sin excepciones.
    const vars = PROVIDERS.map((p) => keySourceOf(p.id));
    expect(new Set(vars).size).toBe(vars.length);
    expect(keySourceOf("openai-compatible")).not.toBe(keySourceOf("opencode-go"));
  });

  it("sin dirección configurada no se puede hablar con el proveedor", () => {
    expect(providerDef("opencode-go")?.baseUrl).toMatch(/^https:\/\//);
    expect(providerDef("anthropic")?.baseUrl).toMatch(/^https:\/\//);
    expect(defaultModelOf("opencode-go")).toBe("deepseek-v4.1-flash");
    expect(defaultModelOf("ollama")).toBe("llama3.1");
    expect(defaultModelOf("anthropic")).toBe("claude-sonnet-4-5");
  });

  it("el endpoint sale del registro: el suyo, el que pone el usuario o su defecto", () => {
    // Fijo en la ficha.
    expect(endpointOf("anthropic", {})).toBe("https://api.anthropic.com/v1");
    expect(endpointSourceOf("anthropic")).toBeUndefined();
    // Del usuario, con defecto declarado.
    expect(endpointSourceOf("ollama")).toBe("OLLAMA_BASE_URL");
    expect(endpointOf("ollama", {})).toBe("http://localhost:11434");
    expect(endpointOf("ollama", { OLLAMA_BASE_URL: "http://192.168.1.9:11434" })).toBe(
      "http://192.168.1.9:11434",
    );
    // Del usuario, sin defecto: sin valor no hay endpoint.
    expect(endpointSourceOf("openai-compatible")).toBe("OPENEXPERT_BASE_URL");
    expect(endpointOf("openai-compatible", {})).toBeUndefined();
    expect(endpointOf("nope" as ModelProviderId, {})).toBeUndefined();
  });

  it("quien pide sesión la declara, y solo quien la pide la recibe", () => {
    const conSesion = PROVIDERS.filter((p) => "sessionHeader" in p && p.sessionHeader);
    expect(conSesion.map((p) => p.id)).toEqual(["opencode-go"]);
  });

  it("los proveedores con clave son los que tienen una variable declarada", () => {
    expect([...BYOK_PROVIDERS]).toEqual(
      PROVIDERS.filter((p) => "env" in p && p.env).map((p) => p.id),
    );
    // Google incluido: su clave es suya, no una ranura compartida.
    expect([...BYOK_PROVIDERS]).toContain("anthropic");
  });

  it("lo que enseña la pantalla también vive en la ficha", () => {
    // El panel recorre el catálogo: si esto se escribe a mano en la interfaz,
    // añadir un proveedor vuelve a tocar tres sitios.
    expect(providerDef("anthropic")?.keyUrl).toMatch(/^https:\/\//);
    for (const p of PROVIDERS) expect(p.note).toBeTruthy();
    expect(providerDef("openai-compatible")?.baseUrlHint).toBeTruthy();
  });

  it("el catálogo se recorre por una única puerta, con la variable ya estrechada", () => {
    // `providerCatalogue` es lo que usan el panel y el CLI: misma lista, con
    // `env` tipado como nombre de variable del catálogo y no como texto suelto.
    const records = providerCatalogue();
    expect(records.map((r) => r.id)).toEqual(PROVIDERS.map((p) => p.id));
    expect(providerKeyEnvOf("anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(providerKeyEnvOf("ollama")).toBeUndefined();
    expect(providerKeyEnvOf("nope")).toBeUndefined();
  });

  it("Copilot y el portal de Nous están fuera a propósito, y así se queda", () => {
    const ids = PROVIDERS.map((p) => p.id);
    // Copilot: sus términos prestan el servicio desde sus propias extensiones.
    expect(ids).not.toContain("copilot");
    // Nous: el acceso es una cuenta OAuth, no una clave de API.
    expect(ids).not.toContain("nous");
  });
});
