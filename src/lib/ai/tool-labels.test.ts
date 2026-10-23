// SPDX-License-Identifier: MIT
// El panel de chat pinta cada herramienta con su descripción
// (`t(TOOL_LABELS[name] ?? name)`) y el catálogo y las etiquetas se mantenían a
// mano, así que una herramienta nueva salía con el nombre técnico en crudo: hoy
// `run_python` y `search_inside_files`. Esta comprobación cruza el catálogo real
// (`Object.keys(createChatTools(...))`) con el mapa de etiquetas, y exige además
// que cada etiqueta tenga su entrada en el diccionario inglés.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { translate } from "@/lib/translate";
import { en } from "@/locales/en";
import { TOOL_LABELS } from "./tool-labels";

let dir: string;

beforeAll(() => {
  // `createChatTools` toca la capa de datos al cargarse: sin un directorio
  // temporal escribiría en el del repo (y el `openexpert.json` de la raíz).
  dir = mkdtempSync(join(tmpdir(), "openexpert-tool-labels-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

async function catalog(): Promise<string[]> {
  const { createChatTools } = await import("./tools");
  const tools = createChatTools({
    expert: { name: "General", sources: ["gdrive", "local"] },
    expertId: "general",
    used: new Set<string>(),
    allowed: () => true,
    proposePending: async (_domain, title, risk, items) => ({
      eventId: "evt_test",
      title,
      risk,
      items,
      status: "pending" as const,
    }),
  });
  return Object.keys(tools).sort();
}

describe("Etiquetas de las herramientas del chat", () => {
  it("hay una etiqueta para cada herramienta del catálogo, y ninguna de más", async () => {
    const names = await catalog();
    expect(names.length).toBeGreaterThanOrEqual(26);
    const withoutLabel = names.filter((name) => !(name in TOOL_LABELS));
    expect(withoutLabel, `\nHerramientas sin etiqueta: ${withoutLabel.join(", ")}\n`).toEqual([]);
    const orphan = Object.keys(TOOL_LABELS)
      .filter((name) => !names.includes(name))
      .sort();
    expect(orphan, `\nEtiquetas de herramientas que ya no existen: ${orphan.join(", ")}\n`).toEqual(
      [],
    );
  });

  it("traduce todas las etiquetas al inglés", async () => {
    const names = await catalog();
    const missing = names
      .map((name) => TOOL_LABELS[name] ?? name)
      .filter((label) => !(label in en) || translate("en", label) === label);
    expect([...new Set(missing)], `\nEtiquetas sin inglés: ${missing.join(", ")}\n`).toEqual([]);
  });

  it("ninguna herramienta se queda con el nombre técnico como etiqueta", async () => {
    const names = await catalog();
    expect(names.filter((name) => TOOL_LABELS[name] === name)).toEqual([]);
  });
});
