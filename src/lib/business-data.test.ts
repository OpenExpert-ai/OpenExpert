// SPDX-License-Identifier: MIT
// La ventana del chat no puede anunciar «no tiene datos que consultar» cuando el
// usuario ha importado su exportación: el aviso miraba solo los conectores.
import { describe, expect, it } from "vitest";
import { BUSINESS_SOURCE_IDS, hasBusinessData } from "./business-data";

const CONNECTED_CRM = [
  { id: "pipedrive", connected: true },
  { id: "holded", connected: false },
];

describe("hasBusinessData", () => {
  it("con una base vacía y ningún conector no hay datos que consultar", () => {
    expect(hasBusinessData({ integrations: [], businessRows: 0 })).toBe(false);
    expect(hasBusinessData({})).toBe(false);
    expect(hasBusinessData(null)).toBe(false);
    expect(hasBusinessData(undefined)).toBe(false);
  });

  it("basta con un conector de negocio conectado", () => {
    expect(hasBusinessData({ integrations: CONNECTED_CRM, businessRows: 0 })).toBe(true);
  });

  it("basta con filas locales aunque no haya ningún conector conectado", () => {
    const sinConectores = CONNECTED_CRM.map((i) => ({ ...i, connected: false }));
    expect(hasBusinessData({ integrations: sinConectores, businessRows: 1 })).toBe(true);
    // El caso de verdad: el usuario importó su CSV y no hay conector ninguno.
    expect(hasBusinessData({ integrations: [], businessRows: 12 })).toBe(true);
  });

  it("un conector conectado que no alimenta datos de negocio no cuenta", () => {
    expect(
      hasBusinessData({ integrations: [{ id: "notion", connected: true }], businessRows: 0 }),
    ).toBe(false);
  });

  it("la lista de conectores de negocio es la que se pinta en la ventana", () => {
    expect(BUSINESS_SOURCE_IDS).toContain("holded");
    expect(BUSINESS_SOURCE_IDS).toContain("pipedrive");
    expect(BUSINESS_SOURCE_IDS).not.toContain("notion");
  });
});
