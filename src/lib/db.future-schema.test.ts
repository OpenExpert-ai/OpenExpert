// SPDX-License-Identifier: MIT
// Una base de datos escrita por una versión **más nueva** de OpenExpert no se abre: este
// código no conoce su esquema y las migraciones que le faltan se saltarían en silencio.
//
// `applyMigrations` (`src/lib/db.server.ts`) compara cada migración con `PRAGMA
// user_version` y se salta las que la base da por aplicadas. Cuando la versión viene por
// delante de la última migración que el código conoce (hoy 7) no se aplica ninguna y la
// app arranca creyendo que el esquema es el suyo. Medido en esta máquina con una base
// completa marcada en 9999: `getDb()` resolvía sin una queja y leía las 4 filas de
// `experts`; con una base a la que le faltaba el esquema, el fallo salía como «table
// experts has no column named domains», que es la migración 0002 sin aplicar y un
// mensaje que no dice nada del motivo.
//
// La puerta de la restauración tiene el mismo agujero: `assertValidDatabase`
// (`src/lib/backup.server.ts`) comprueba la cabecera de SQLite y que sql.js lea el
// esquema, pero nunca `user_version`. El `version` que sí se rechaza es el del *formato
// del paquete*, no el del esquema de la base, así que una copia hecha con una build
// posterior entra entera.

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/** Una versión que ninguna migración de este repositorio va a alcanzar. */
const FUTURA = 9999;

const temporales: string[] = [];
const entornoOriginal = { dir: process.env["OPENEXPERT_DATA_DIR"], cwd: process.cwd() };

afterAll(() => {
  if (entornoOriginal.dir === undefined) delete process.env["OPENEXPERT_DATA_DIR"];
  else process.env["OPENEXPERT_DATA_DIR"] = entornoOriginal.dir;
  process.chdir(entornoOriginal.cwd);
  for (const d of temporales) rmSync(d, { recursive: true, force: true });
});

/** Una carpeta de datos vacía, aislada de la instalación real. */
function datosNuevos(): string {
  const dir = mkdtempSync(join(tmpdir(), "openexpert-version-"));
  temporales.push(dir);
  process.env["OPENEXPERT_DATA_DIR"] = dir;
  return dir;
}

const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** El error que lanza un rechazo esperado; si no rechaza, el test lo dice con esas palabras. */
async function rechazoDe(work: Promise<unknown>): Promise<Error> {
  try {
    await work;
  } catch (e) {
    return e as Error;
  }
  throw new Error(
    "la operación terminó bien cuando tenía que rechazar una base de una versión más nueva",
  );
}

describe("una base de datos de una versión más nueva", () => {
  it("no se abre, y no se toca el fichero", async () => {
    const dir = datosNuevos();
    const { getDb, resetDbHandle, persist, dbPath } = await import("./db.server");
    // Una base completa, la que crea la app, marcada como escrita por una build posterior.
    resetDbHandle();
    const { raw } = await getDb();
    const propia = Number(raw.exec("PRAGMA user_version")[0]?.values[0]?.[0]);
    expect(propia).toBeGreaterThanOrEqual(1);
    raw.exec(`PRAGMA user_version = ${FUTURA}`);
    await persist();
    resetDbHandle();

    const file = dbPath();
    expect(file.startsWith(dir)).toBe(true);
    const antes = sha(file);

    const error = await rechazoDe(getDb());

    // El mensaje dice qué pasa (versión más nueva), con las dos versiones, y qué hacer.
    expect(error.message).toMatch(/versi[óo]n m[áa]s nueva/i);
    expect(error.message).toContain(String(FUTURA));
    expect(error.message).toContain(String(propia));
    // Y no ha dejado la base a medio migrar: el fichero es el mismo, byte a byte.
    expect(sha(file)).toBe(antes);
  });

  it("una copia con una base del futuro se rechaza antes de tocar la instalación", async () => {
    const datos = datosNuevos();
    const cwd = mkdtempSync(join(tmpdir(), "openexpert-version-cwd-"));
    temporales.push(cwd);
    process.chdir(cwd);
    const { getDb, resetDbHandle, persist, dbPath } = await import("./db.server");
    const { restoreBackup } = await import("./backup.server");

    // La instalación de destino, en la versión que esta build entiende.
    resetDbHandle();
    await getDb();
    await persist();
    const antes = sha(dbPath());

    // La copia viene de una build posterior: su base está en la versión del futuro.
    datosNuevos();
    resetDbHandle();
    const { raw: rawFutura } = await getDb();
    rawFutura.exec(`PRAGMA user_version = ${FUTURA}`);
    await persist();
    const blob = readFileSync(dbPath());
    resetDbHandle();

    // Y se intenta restaurar sobre la instalación de antes.
    process.env["OPENEXPERT_DATA_DIR"] = datos;
    resetDbHandle();
    const paquete = JSON.stringify({
      format: "openexpert-backup",
      version: 2,
      createdAt: new Date().toISOString(),
      files: { db: blob.toString("base64") },
    });

    const error = await rechazoDe(restoreBackup(paquete));

    expect(error.message).toMatch(/versi[óo]n m[áa]s nueva/i);
    expect(error.message).toContain(String(FUTURA));
    // Nada se aplicó: la base de la instalación es la misma y no quedó una copia de seguridad
    // de una restauración que no llegó a empezar.
    expect(sha(dbPath())).toBe(antes);
    expect(existsSync(`${dbPath()}.bak`)).toBe(false);
  });

  it("una base en la versión actual se sigue abriendo y migrando", async () => {
    datosNuevos();
    const { getDb, resetDbHandle } = await import("./db.server");
    const schema = await import("../../drizzle/schema");
    resetDbHandle();
    const { orm, raw } = await getDb();
    expect(Number(raw.exec("PRAGMA user_version")[0]?.values[0]?.[0])).toBeGreaterThanOrEqual(1);
    expect(
      orm
        .select()
        .from(schema.experts)
        .all()
        .map((e) => e.id),
    ).toContain("general");
  });
});
