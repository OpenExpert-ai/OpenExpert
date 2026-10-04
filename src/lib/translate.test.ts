// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { translate } from "./translate";

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
