// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import {
  BYOK_PROVIDERS,
  defaultModelOf,
  keySourceOf,
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
      // No toda ficha declara dirección, y es correcto: Ollama es local, el genérico lo
      // apunta el usuario, y Google usa la del adaptador. Declararla es para los que
      // tienen endpoint propio, y esos sí la llevan.
      const usaLaDelAdaptador =
        p.id === "ollama" || p.id === "openai-compatible" || p.id === "google";
      if (!usaLaDelAdaptador) {
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
  });

  it("la clave sale del catálogo, no de una segunda lista que mantener", () => {
    expect(keySourceOf("google")).toBe("GOOGLE_API_KEY");
    expect(keySourceOf("opencode-go")).toBe("OPENEXPERT_MODEL_KEY");
    expect(keySourceOf("ollama")).toBe("none (local)");
  });

  it("sin dirección configurada no se puede hablar con el proveedor", () => {
    expect(providerDef("opencode-go")?.baseUrl).toMatch(/^https:\/\//);
    expect(defaultModelOf("opencode-go")).toBe("deepseek-v4.1-flash");
    expect(defaultModelOf("ollama")).toBe("llama3.1");
  });

  it("quien pide sesión la declara, y solo quien la pide la recibe", () => {
    const conSesion = PROVIDERS.filter((p) => "sessionHeader" in p && p.sessionHeader);
    expect(conSesion.map((p) => p.id)).toEqual(["opencode-go"]);
  });

  it("los proveedores con clave son los que tienen una variable declarada", () => {
    expect([...BYOK_PROVIDERS]).toEqual(
      PROVIDERS.filter((p) => "env" in p && p.env).map((p) => p.id),
    );
  });

  it("Copilot y el portal de Nous están fuera a propósito, y así se queda", () => {
    const ids = PROVIDERS.map((p) => p.id);
    // Copilot: sus términos prestan el servicio desde sus propias extensiones.
    expect(ids).not.toContain("copilot");
    // Nous: el acceso es una cuenta OAuth, no una clave de API.
    expect(ids).not.toContain("nous");
  });
});
