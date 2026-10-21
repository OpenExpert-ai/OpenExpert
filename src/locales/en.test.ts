// SPDX-License-Identifier: MIT
// The English dictionary has to cover every `t("…")` call in `src/`.
//
// `translate` falls back to the Spanish source when a key is missing, so a hole
// in the dictionary is invisible: nothing throws, the English interface simply
// shows a Spanish sentence. It already shipped like that on the 404 page and the
// root error boundary, the two screens a user only sees when something has gone
// wrong. This test walks the call sites with the TypeScript parser — so comments
// and unrelated string literals cannot fake a hit or hide one — and fails when a
// literal key has no entry.

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

type KeyAt = { key: string; where: string };

/**
 * Literal keys passed to `t()`. Keys computed at runtime (`t(label)`) are not
 * included: there is nothing to compare them against without running the app.
 */
function literalKeys(): KeyAt[] {
  const found: KeyAt[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const where = (node: ts.Node) =>
      `${relative(REPO, file)}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}`;

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t"
      ) {
        const first = node.arguments[0];
        if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
          found.push({ key: first.text, where: where(node) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return found;
}

const keys = literalKeys();

describe("English dictionary", () => {
  it("has an entry for every t() literal in src/", () => {
    const missing = keys.filter(({ key }) => !(key in en));
    const detail = missing.map(({ key, where }) => `  ${where}  ${JSON.stringify(key)}`).join("\n");
    expect(missing, `\nSin traducción al inglés:\n${detail}\n`).toEqual([]);
  });

  it("does not need the Spanish fallback on the screens that shipped untranslated", () => {
    // The strings T-0089 found. `translate` returns the key itself when the
    // entry is missing, which is exactly the Spanish text leaking into English
    // mode, so comparing against the key is the check.
    const fixed = [
      "Página no encontrada",
      "La página que buscas no existe o se ha movido.",
      "Volver al inicio",
      "Esta página no se pudo cargar",
      "Algo ha fallado. Prueba a recargar o vuelve al inicio.",
      "Reintentar",
      "Experto activo",
      "Pensando…",
      "Clave de API",
      "Leer PDF escaneados con el modelo",
      "Fuentes pendientes",
      "Entidades",
      "Fuentes de datos conectadas a tus Expertos.",
      "¿Eliminar openexpert.json y volver a los valores por defecto?",
      "Cuando un PDF no tiene texto (es la foto de una página), se transcribe con el modelo activo. Eso manda el documento al proveedor: actívalo solo si eso te parece bien. Necesita un proveedor que vea documentos.",
    ];
    const stillSpanish = fixed.filter((key) => translate("en", key) === key);
    expect(stillSpanish).toEqual([]);
  });

  it("has no empty translations", () => {
    expect(Object.entries(en).filter(([, value]) => !value.trim())).toEqual([]);
  });
});
