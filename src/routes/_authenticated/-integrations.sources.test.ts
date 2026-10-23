// SPDX-License-Identifier: MIT
// The data-sources page wrote its texts straight into Spanish, so connecting
// Drive and Notion stayed in Spanish with the interface in English. Nothing
// failed: the words were simply never handed to `t()`. Both checks read the
// page source, which is where that can be seen — mounting the route would drag
// the server functions along with it.
//
// The route's `head` metadata (the tab title) is out of scope: the server
// renders it before it can know the interface language, which is a client
// preference, and every route keeps it in Spanish.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { translate } from "@/lib/translate";
import { en } from "@/locales/en";

const PAGE = fileURLToPath(new URL("./integrations.sources.tsx", import.meta.url));
const source = readFileSync(PAGE, "utf8");
const ast = ts.createSourceFile(PAGE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const at = (node: ts.Node) => `${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}`;

/**
 * Google requires this sentence verbatim, in English, on the consent screen:
 * it is the one text of the page that must not follow the interface language.
 */
const LEGAL = /Google Workspace scopes|Limited Use requirements/;

/** Identifiers and cited names: the same in every language. */
const NOT_COPY = new Set(["drive.file", "Google User Data Policy"]);

type Bare = { line: string; text: string };

/** `<code>` holds identifiers and paths (`drive.file`, `~/.openexpert/`). */
function insideCode(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    parent !== undefined &&
    ts.isJsxElement(parent) &&
    parent.openingElement.tagName.getText(ast) === "code"
  );
}

/** User-visible text that does not go through `t()`. */
function bareTexts(): Bare[] {
  const found: Bare[] = [];

  const visit = (node: ts.Node) => {
    // Text sitting between tags: `<div>Pendiente de credenciales</div>`. Any
    // letter here is copy, so there is nothing to weigh up.
    if (ts.isJsxText(node) && /[a-záéíóúñ]/i.test(node.text)) {
      const text = node.text.trim();
      if (!LEGAL.test(text) && !NOT_COPY.has(text) && !insideCode(node)) {
        found.push({ line: at(node), text });
      }
    }

    // `toast.success("…")` talks to the user just as much as a paragraph does.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const { expression, name } = node.expression;
      if (
        ts.isIdentifier(expression) &&
        expression.text === "toast" &&
        /^(success|error|info|warning)$/.test(name.text)
      ) {
        const first = node.arguments[0];
        if (first && (ts.isStringLiteral(first) || ts.isTemplateExpression(first))) {
          found.push({ line: at(node), text: first.getText(ast) });
        }
      }
    }

    // Accessible names and placeholders are read out; they need `t()` too.
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(ast);
      const init = node.initializer;
      if (/^(aria-label|placeholder|title|alt)$/.test(name) && init && ts.isStringLiteral(init)) {
        found.push({ line: at(node), text: init.text });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(ast);
  return found;
}

/**
 * The strings this page shows, as they read in Spanish. Brand names (`Notion`,
 * `Google Drive`) are the same in both languages and are not listed: what is
 * checked here is that the English copy exists and is not the Spanish one.
 */
const VISIBLE = [
  "Notion conectado.",
  "Google Drive conectado. Ahora selecciona archivos con el Picker.",
  "Falta configurar el cliente OAuth en el servidor.",
  "Configura GOOGLE_PICKER_API_KEY en el archivo de secretos para habilitar el Picker.",
  "No se seleccionó ningún archivo (acción del Picker: {action}).",
  "desconocida",
  "Abriendo Picker…",
  "Seleccionar archivos",
  "{n} archivo añadido.",
  "{n} archivos añadidos.",
  "{n} archivo elegido",
  "{n} archivos elegidos",
  "{n} carpeta autorizada",
  "{n} carpetas autorizadas",
  "Quitar archivo",
  "Aún no has elegido archivos. Pulsa “Seleccionar archivos”.",
  "Pendiente de credenciales",
  "(Pronto)",
  "OpenExpert usa",
  "(no sensible, archivo por archivo). Solo ves lo que elijas en el Picker. El contenido se envía al proveedor del modelo (por defecto local) para responderte.",
  "Conectar Google Drive",
  "OpenExpert va a acceder a Google Drive con tu consentimiento. Antes de continuar, confirma que entiendes lo siguiente:",
  "Solo pedimos el scope",
  "(no sensible). El asistente no puede leer ni listar tu Drive completo.",
  "Con el Picker elegirás",
  "archivo por archivo",
  "qué puede ver OpenExpert.",
  "El contenido de los archivos elegidos se transmite al modelo para responderte; usa",
  "Ollama local",
  "si no quieres que salga de tu equipo.",
  "No usamos tus datos para entrenar modelos. No los vendemos ni los cedemos a terceros.",
  "Los tokens se guardan cifrados (AES-GCM) en",
  "con modo 0600.",
  "Entiendo y conecto",
];

describe("página de Fuentes de datos", () => {
  it("pasa por t() todo el texto que se ve", () => {
    const bare = bareTexts();
    const detail = bare.map(({ line, text }) => `  línea ${line}: ${text}`).join("\n");
    expect(bare, `\nTexto visible sin t():\n${detail}\n`).toEqual([]);
  });

  it("tiene copia inglesa para esas cadenas", () => {
    const stillSpanish = VISIBLE.filter((key) => !(key in en) || translate("en", key) === key);
    expect(stillSpanish).toEqual([]);
  });
});
