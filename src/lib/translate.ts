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
