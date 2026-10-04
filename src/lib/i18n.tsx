// SPDX-License-Identifier: MIT
// Lightweight i18n provider. The source language is Spanish: `t("Texto")`
// returns the text unchanged for `es` and looks it up in the English dictionary
// for `en`. Missing entries fall back to the Spanish source, so the app never
// breaks.
//
// Strings with values use `{placeholders}`, e.g. t("Creado {name}", { name }).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getUiSettings, setUiSettings } from "./settings.functions";
import { translate, type Locale, type Params } from "./translate";

export type { Locale };

const LOCALE_KEY = "openexpert:locale";

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (text: string, params?: Params) => string;
};

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("es");

  useEffect(() => {
    const stored = localStorage.getItem(LOCALE_KEY) as Locale | null;
    const apply = (l: Locale) => {
      setLocaleState(l);
      if (typeof document !== "undefined") document.documentElement.lang = l;
    };
    if (stored) {
      apply(stored);
    } else {
      getUiSettings()
        .then((ui) => apply(ui.language))
        .catch(() => apply("es"));
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(LOCALE_KEY, l);
    if (typeof document !== "undefined") document.documentElement.lang = l;
    setUiSettings({ data: { language: l } }).catch(() => {});
  }, []);

  const t = useCallback(
    (text: string, params?: Params) => translate(locale, text, params),
    [locale],
  );

  return <I18nCtx.Provider value={{ locale, setLocale, t }}>{children}</I18nCtx.Provider>;
}

const FALLBACK: Ctx = {
  locale: "es",
  setLocale: () => {},
  t: (text, params) => translate("es", text, params),
};

export function useT(): Ctx {
  return useContext(I18nCtx) ?? FALLBACK;
}
