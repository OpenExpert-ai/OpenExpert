// SPDX-License-Identifier: MIT
// What "Probar conexión" and "Listar" ask about.
//
// The panel keeps the provider, the endpoint and the key in its own state and
// writes them only when the owner presses "Guardar cambios", so the two
// buttons have to say **what** they are asking about. This is where that
// translation lives, and these tests pin the three decisions it makes.

import { describe, expect, it } from "vitest";

import { probePayload } from "./provider-probe";

/** The provider records as the panel sees them. */
const view = (id: string, endpointEnv: string | null) => ({
  id,
  endpoint: { env: endpointEnv },
});

describe("probePayload", () => {
  it("lleva el proveedor elegido", () => {
    expect(probePayload(view("anthropic", null), "", "").provider).toBe("anthropic");
  });

  it("lleva el endpoint escrito cuando el proveedor tiene dirección propia", () => {
    expect(
      probePayload(view("openai-compatible", "OPENEXPERT_BASE_URL"), " https://nuevo.test/v1 ", "")
        .endpoint,
    ).toBe("https://nuevo.test/v1");
  });

  it("no lleva endpoint para un proveedor con dirección fija", () => {
    // Anthropic brings its own address: sending another would be ignored, and
    // sending it would give the impression that it can be changed.
    expect(probePayload(view("anthropic", null), "https://nuevo.test/v1", "").endpoint).toBe("");
  });

  it("lleva la clave solo si se ha escrito una", () => {
    expect(probePayload(view("google", null), "", "clave-nueva").key).toBe("clave-nueva");
    // The blank field means "the one that is already there", not "none".
    expect(probePayload(view("google", null), "", "").key).toBeUndefined();
  });

  it("sin proveedor todavía pregunta por el primero del catálogo", () => {
    expect(probePayload(undefined, "", "").provider).toBe("ollama");
  });
});
