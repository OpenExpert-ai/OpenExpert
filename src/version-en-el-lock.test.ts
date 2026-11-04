// SPDX-License-Identifier: MIT
// El lockfile no solo lista dependencias: también guarda el nombre y la versión
// del paquete compartido (`packages/openexpert`). `changeset version` sube el
// manifiesto y, hasta ahora, dejaba esa entrada en la versión anterior; `npm ci`
// no se queja de la diferencia, así que el release se publicaba con el lock
// desactualizado y la siguiente persona comparaba números que no cuadran.
// `npm run version-packages` regenera el lock y esta puerta lo comprueba en
// cualquier pull request, sin salir a la red: el dato ya está en el fichero.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Manifest = { name: string; version: string };
type Lockfile = { packages: Record<string, Manifest | undefined> };

function readJson<T>(relativePath: string): T {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("la versión del paquete compartido", () => {
  const manifest = readJson<Manifest>("packages/openexpert/package.json");
  const lockEntry = readJson<Lockfile>("package-lock.json").packages["packages/openexpert"];

  it("está en el lockfile", () => {
    expect(lockEntry).toBeDefined();
  });

  it("coincide con el manifiesto", () => {
    expect(lockEntry?.version).toBe(manifest.version);
  });

  it("conserva el nombre del manifiesto", () => {
    expect(lockEntry?.name).toBe(manifest.name);
  });
});
