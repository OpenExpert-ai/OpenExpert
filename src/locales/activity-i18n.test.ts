// SPDX-License-Identifier: MIT
// Los tipos de evento del registro son datos que escribe el código, no claves
// literales de `t()`: `logActivity({ type: "Consulta" })` en 14 sitios de `src/`
// y el riesgo que recibe `proposePending`. La comprobación global
// (`src/locales/en.test.ts`) solo mira los literales que se le pasan a `t()`, así
// que estos se quedaban en español con la interfaz en inglés sin que nada
// avisara. Aquí se recogen del AST de las llamadas y se les exige su entrada.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { translate } from "@/lib/translate";
import { en } from "./en";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

type TypeAt = { type: string; where: string };

/** Los `type` que el código escribe en el registro de actividad. */
function activityTypes(): TypeAt[] {
  const found: TypeAt[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const where = (node: ts.Node) =>
      `${relative(REPO, file)}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}`;
    const literal = (node: ts.Expression | undefined): string | null =>
      node && ts.isStringLiteral(node) ? node.text : null;

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(ast);
        // logActivity({ …, type: "Consulta", … })
        if (callee.endsWith("logActivity")) {
          const arg = node.arguments[0];
          if (arg && ts.isObjectLiteralExpression(arg)) {
            for (const prop of arg.properties) {
              if (!ts.isPropertyAssignment(prop)) continue;
              const name = prop.name.getText(ast);
              if (name !== "type") continue;
              const value = literal(prop.initializer);
              if (value) found.push({ type: value, where: where(node) });
            }
          }
        }
        // proposePending(domain, título, "Cobro", items, pending)
        if (callee === "proposePending") {
          const value = literal(node.arguments[2]);
          if (value) found.push({ type: value, where: where(node) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return found;
}

describe("El registro de actividad en inglés", () => {
  const types = activityTypes();

  it("encuentra los tipos que el código escribe", () => {
    // Sin esto, un cambio en la sonda dejaría las dos comprobaciones de abajo
    // pasando por vacío.
    expect(types.length).toBeGreaterThanOrEqual(14);
    expect(types.map((x) => x.type)).toContain("Consulta");
    expect(types.map((x) => x.type)).toContain("Seguridad");
  });

  it("traduce todos los tipos de evento que el código escribe", () => {
    const missing = types
      .filter(({ type }) => !(type in en) || translate("en", type) === type)
      .map(({ type, where }) => `  ${where}  ${JSON.stringify(type)}`);
    expect(
      [...new Set(missing)],
      `\nTipos sin traducción al inglés:\n${missing.join("\n")}\n`,
    ).toEqual([]);
  });

  it("traduce las etiquetas de los estados que pinta el registro", () => {
    // El estado es un dato de la base («ok», «pending»…): lo que se traduce es
    // su etiqueta, que es la que llega a `t()` desde la insignia y el filtro.
    const labels = ["Hecho", "Pendiente", "Revertido", "Denegado", "Fallido", "Cancelado"];
    const missing = labels.filter((label) => !(label in en) || translate("en", label) === label);
    expect(missing, `\nEstados sin traducción al inglés: ${missing.join(", ")}\n`).toEqual([]);
  });
});
