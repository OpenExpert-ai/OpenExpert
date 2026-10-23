// SPDX-License-Identifier: MIT
// Pure translation helper (no React, no server imports) so it can be unit
// tested in isolation. See src/lib/i18n.tsx for the provider.

import { en } from "@/locales/en";

export type Locale = "es" | "en";
export type Params = Record<string, string | number>;

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

/**
 * Translate a Spanish source string. Spanish returns it unchanged; English
 * looks it up in the dictionary and falls back to the source when missing.
 */
export function translate(locale: Locale, text: string, params?: Params): string {
  const out = locale === "en" ? (en[text] ?? text) : text;
  return interpolate(out, params);
}

/**
 * Elige entre la forma singular y la plural y la traduce: `pluralize("en", 1,
 * "{n} mensaje", "{n} mensajes")` → «1 message». El diccionario no pluraliza
 * (`t` solo interpola), así que el número y el sustantivo tienen que pasar por
 * aquí juntos; con el plural fijo, un recuento de uno decía «1 mensajes».
 */
export function pluralize(
  locale: Locale | undefined,
  n: number,
  one: string,
  other: string,
  params?: Params,
): string {
  const source = n === 1 ? one : other;
  const out = locale === "en" ? (en[source] ?? source) : source;
  return interpolate(out, { n, ...params });
}

/** Concordancia para textos de servidor (sin diccionario): `countPhrase(1, "mensaje", "mensajes")` → «1 mensaje». */
export function countPhrase(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
