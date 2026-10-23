// SPDX-License-Identifier: MIT
/**
 * The published schema and the file the application writes.
 *
 * Every `openexpert.json` the application writes carries `$schema`, which points
 * the editor at `packages/openexpert/schema/openexpert.schema.json`; from then on
 * the IDE validates the file with that schema. If the schema does not declare a
 * key the application itself writes, the editor paints the whole configuration
 * red, the example the repo publishes fails its own validation, and any tool in
 * the chain that checks the file says the application's configuration is invalid.
 * That is what happened with `$schema` and `chat.visionPdf`: they were written by
 * `writeFileConfig` and `settings.chat.tsx` and never declared.
 *
 * This gate compares both sides: every key the application can write
 * (`fileConfigSchema` and `chatUpdateSchema` in `config.server.ts`) has to be
 * declared in the published schema, and the published schema may not declare a
 * key the application cannot write. The real files are validated too — the one
 * the writer leaves on disk and the example the repo publishes.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  chatUpdateSchema,
  fileConfigSchema,
  writeFileConfig,
  type RawFileConfig,
} from "./config.server";

/* --------------------------- the JSON schema ---------------------------- */

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  minLength?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  format?: string;
};

const SCHEMA_PATH = new URL(
  "../../packages/openexpert/schema/openexpert.schema.json",
  import.meta.url,
);
const EXAMPLE_PATH = new URL("../../openexpert.json.example", import.meta.url);

const publishedSchema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as JsonSchema;

/**
 * The keywords this gate understands.
 *
 * A schema that grows a keyword nobody validates here is not a schema this gate
 * can vouch for, so an unknown one is an error instead of being skipped: a check
 * that quietly ignores what it does not read is the same as no check. `format`
 * is the one keyword in the list that is only *read*: draft-07 leaves it as an
 * annotation and neither jsonschema nor ajv asserts it unless they are asked to,
 * so the gate does not either (and `ollamaBaseUrl` is empty in the file the
 * panel writes when the provider is not Ollama).
 */
const KNOWN_KEYWORDS = new Set([
  "$schema",
  "$id",
  "title",
  "description",
  "type",
  "properties",
  "additionalProperties",
  "required",
  "enum",
  "items",
  "minLength",
  "maxItems",
  "minimum",
  "maximum",
  "format",
]);

/**
 * Validate `value` against the subset of draft-07 the published schema uses.
 *
 * Returns one sentence per problem, with the path of the value that broke it, so
 * a red run names the key that is missing instead of saying «no valida».
 */
function errorsOf(value: unknown, schema: JsonSchema, path = "(raíz)"): string[] {
  const unknown = Object.keys(schema).filter((keyword) => !KNOWN_KEYWORDS.has(keyword));
  if (unknown.length > 0) {
    throw new Error(
      `el esquema usa palabras clave que esta puerta no valida: ${unknown.join(", ")}`,
    );
  }

  const errors: string[] = [];

  if (
    schema.enum &&
    !schema.enum.some((option) => JSON.stringify(option) === JSON.stringify(value))
  ) {
    errors.push(`${path}: ${JSON.stringify(value)} no está en ${JSON.stringify(schema.enum)}`);
  }

  if (schema.type) {
    const kind = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    const matches =
      (schema.type === "object" && kind === "object") ||
      (schema.type === "array" && kind === "array") ||
      (schema.type === "string" && kind === "string") ||
      (schema.type === "boolean" && kind === "boolean") ||
      (schema.type === "number" && kind === "number" && Number.isFinite(value)) ||
      (schema.type === "integer" && kind === "number" && Number.isInteger(value));
    if (!matches) {
      errors.push(`${path}: es ${kind} y el esquema dice ${schema.type}`);
      return errors;
    }
  }

  if (schema.type === "object" && typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!(key in record)) errors.push(`${path}: falta ${key}`);
    }
    for (const [key, child] of Object.entries(record)) {
      const declared = properties[key];
      if (!declared) {
        if (schema.additionalProperties === false) {
          errors.push(`${path}: no declara la clave "${key}" (additionalProperties: false)`);
        }
        continue;
      }
      errors.push(...errorsOf(child, declared, path === "(raíz)" ? key : `${path}.${key}`));
    }
  }

  if (schema.type === "array" && Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: ${value.length} elementos y el máximo es ${schema.maxItems}`);
    }
    const items = schema.items;
    if (items) {
      value.forEach((element, index) => {
        errors.push(...errorsOf(element, items, `${path}[${index}]`));
      });
    }
  }

  if (
    typeof value === "string" &&
    schema.minLength !== undefined &&
    value.length < schema.minLength
  ) {
    errors.push(`${path}: más corto que ${schema.minLength}`);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: ${value} es menor que ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: ${value} es mayor que ${schema.maximum}`);
    }
  }

  return errors;
}

/* ------------------------ what the app can write ------------------------ */

/** The keys a Zod object accepts, looking through `optional()` and `default()`. */
function zodObjectKeys(schema: z.ZodType): string[] | null {
  let inner: z.ZodType = schema;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodDefault) {
    inner = inner.unwrap() as z.ZodType;
  }
  if (!(inner instanceof z.ZodObject)) return null;
  const shape: z.ZodRawShape = inner.shape;
  return Object.keys(shape);
}

/**
 * The application writes the file in two places: the raw editor and the settings
 * panels go through `fileConfigSchema`, and the chat panel writes `chat` through
 * `chatUpdateSchema`. `fileConfigSchema` is the whole file, so it is the one the
 * published schema is compared with; `chatUpdateSchema` is checked too because a
 * key the panel can save is a key the file will carry.
 */
function differences(
  declared: JsonSchema | undefined,
  accepted: string[],
): { missing: string[]; extra: string[] } {
  const properties = declared?.properties ?? {};
  const missing = accepted.filter((key) => !(key in properties));
  const extra = Object.keys(properties).filter((key) => !accepted.includes(key));
  return { missing, extra };
}

const rootKeys = zodObjectKeys(fileConfigSchema);
const chatKeys = zodObjectKeys(fileConfigSchema.shape.chat);
const aiKeys = zodObjectKeys(fileConfigSchema.shape.ai);
const panelChatKeys = zodObjectKeys(chatUpdateSchema);

/* -------------------------------- tests -------------------------------- */

/**
 * The file the application leaves behind: every key it manages, with a value in
 * range. The writer adds `$schema` by itself, so what comes back is exactly what
 * an editor opens and validates.
 */
const writtenConfig: RawFileConfig = {
  modelProvider: "ollama",
  modelId: "llama3.1",
  ollamaBaseUrl: "http://localhost:11434",
  dataDir: "~/.openexpert",
  googleClientId: "1234567890-abc.apps.googleusercontent.com",
  notionClientId: "notion-client-id",
  ai: { temperature: 0.5, topP: 1, maxOutputTokens: 4096 },
  chat: {
    maxSteps: 50,
    injectionGuard: true,
    visionPdf: true,
    injectionExtraPatterns: ["ignora las instrucciones anteriores"],
    retentionDays: 30,
  },
};

/** Write `partial` as the application does and read the file back from disk. */
function fileWrittenBy(partial: RawFileConfig): Record<string, unknown> {
  const dir = mkdtempSync(join(tmpdir(), "openexpert-schema-"));
  try {
    writeFileConfig(partial, dir);
    return JSON.parse(readFileSync(join(dir, "openexpert.json"), "utf8")) as Record<
      string,
      unknown
    >;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("el esquema publicado de openexpert.json", () => {
  it("acepta el fichero que escribe la aplicación", () => {
    const written = fileWrittenBy(writtenConfig);

    expect(written["$schema"]).toBe("./packages/openexpert/schema/openexpert.schema.json");
    expect(fileConfigSchema.safeParse(written).success).toBe(true);
    expect(errorsOf(written, publishedSchema)).toEqual([]);
  });

  it("acepta el fichero que deja el panel cuando el proveedor no es Ollama", () => {
    // `ollamaBaseUrl` empty is what the settings panel saves when another
    // provider is selected, so it is a file the application writes and the
    // schema has to read.
    const written = fileWrittenBy({ ...writtenConfig, ollamaBaseUrl: "" });

    expect(errorsOf(written, publishedSchema)).toEqual([]);
  });

  it("acepta el openexpert.json.example que publica el repo", () => {
    const example = JSON.parse(readFileSync(EXAMPLE_PATH, "utf8")) as Record<string, unknown>;
    expect(errorsOf(example, publishedSchema)).toEqual([]);
  });

  it("declara todas las claves de la raíz que la aplicación escribe", () => {
    expect(rootKeys).not.toBeNull();
    const { missing, extra } = differences(publishedSchema, rootKeys ?? []);
    expect(missing, "claves que la aplicación escribe y el esquema no declara").toEqual([]);
    expect(extra, "claves que el esquema declara y la aplicación no escribe").toEqual([]);
  });

  it("declara todas las claves de chat que la aplicación escribe", () => {
    expect(chatKeys).not.toBeNull();
    const { missing, extra } = differences(publishedSchema.properties?.["chat"], chatKeys ?? []);
    expect(missing, "claves de chat que la aplicación escribe y el esquema no declara").toEqual([]);
    expect(extra, "claves de chat que el esquema declara y la aplicación no escribe").toEqual([]);
  });

  it("declara todas las claves de ai que la aplicación escribe", () => {
    expect(aiKeys).not.toBeNull();
    const { missing, extra } = differences(publishedSchema.properties?.["ai"], aiKeys ?? []);
    expect(missing, "claves de ai que la aplicación escribe y el esquema no declara").toEqual([]);
    expect(extra, "claves de ai que el esquema declara y la aplicación no escribe").toEqual([]);
  });

  it("declara todas las claves que el panel de chat puede guardar", () => {
    expect(panelChatKeys).not.toBeNull();
    const { missing } = differences(publishedSchema.properties?.["chat"], panelChatKeys ?? []);
    expect(missing, "claves que el panel de chat guarda y el esquema no declara").toEqual([]);
  });
});
