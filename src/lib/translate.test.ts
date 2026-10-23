// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { pluralize, translate } from "./translate";

describe("translate", () => {
  it("returns the Spanish source unchanged for es", () => {
    expect(translate("es", "Modelo e IA")).toBe("Modelo e IA");
  });

  it("translates known strings to English", () => {
    expect(translate("en", "Modelo")).toBe("Model");
    expect(translate("en", "Configuración")).toBe("Settings");
  });

  it("falls back to the source when an entry is missing", () => {
    expect(translate("en", "cadena-sin-traduccion")).toBe("cadena-sin-traduccion");
  });

  it("interpolates placeholders", () => {
    expect(translate("en", "Historial ({n})", { n: 3 })).toBe("History (3)");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(translate("en", "Hola {name}", {})).toBe("Hola {name}");
  });
});

describe("pluralize", () => {
  it("elige la forma en español", () => {
    for (const [n, esperado] of [
      [0, "0 mensajes"],
      [1, "1 mensaje"],
      [2, "2 mensajes"],
    ] as const) {
      expect(pluralize("es", n, "{n} mensaje", "{n} mensajes")).toBe(esperado);
    }
  });

  it("elige la forma en inglés", () => {
    for (const [n, esperado] of [
      [0, "0 messages"],
      [1, "1 message"],
      [2, "2 messages"],
    ] as const) {
      expect(pluralize("en", n, "{n} mensaje", "{n} mensajes")).toBe(esperado);
    }
  });

  it("interpola los demás parámetros y no toca el número", () => {
    expect(pluralize("es", 1, "{a} de {b} evento", "{a} de {b} eventos", { a: 1, b: 3 })).toBe(
      "1 de 3 evento",
    );
    expect(pluralize("en", 3, "{a} de {b} evento", "{a} de {b} eventos", { a: 3, b: 3 })).toBe(
      "3 of 3 events",
    );
  });

  it("cae al español cuando no hay locale ni entrada en el diccionario", () => {
    expect(pluralize(undefined, 1, "cadena-sin-traduccion", "otra")).toBe("cadena-sin-traduccion");
  });
});
