// SPDX-License-Identifier: MIT
// Theme + density provider. Applied to <html> so every screen follows the
// preference. Mirrored to localStorage (instant, no flash) and to the local
// database (so it survives and is visible to the settings panel).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getUiSettings, setUiSettings } from "./settings.functions";

export type Theme = "dark" | "light" | "system";
export type Density = "comfortable" | "compact";

const THEME_KEY = "openexpert:theme";
const DENSITY_KEY = "openexpert:density";

type Ctx = {
  theme: Theme;
  density: Density;
  resolvedTheme: "dark" | "light";
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

function systemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolve(theme: Theme): "dark" | "light" {
  return theme === "system" ? systemTheme() : theme;
}

function apply(theme: Theme, density: Density): "dark" | "light" {
  const resolved = resolve(theme);
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.classList.toggle("density-compact", density === "compact");
  }
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [density, setDensityState] = useState<Density>("comfortable");
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  // Initial load: localStorage first (instant), otherwise the stored setting.
  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_KEY) as Theme | null;
    const storedDensity = localStorage.getItem(DENSITY_KEY) as Density | null;

    if (storedTheme || storedDensity) {
      const t = storedTheme ?? "dark";
      const d = storedDensity ?? "comfortable";
      setThemeState(t);
      setDensityState(d);
      setResolvedTheme(apply(t, d));
    } else {
      getUiSettings()
        .then((ui) => {
          setThemeState(ui.theme);
          setDensityState(ui.density);
          localStorage.setItem(THEME_KEY, ui.theme);
          localStorage.setItem(DENSITY_KEY, ui.density);
          setResolvedTheme(apply(ui.theme, ui.density));
        })
        .catch(() => setResolvedTheme(apply("dark", "comfortable")));
    }
  }, []);

  // React to changes.
  useEffect(() => {
    setResolvedTheme(apply(theme, density));
  }, [theme, density]);

  // Follow the OS while in "system" mode.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setResolvedTheme(apply("system", density));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, density]);

  const persist = useCallback((next: { theme?: Theme; density?: Density }) => {
    setUiSettings({ data: next }).catch(() => {});
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      localStorage.setItem(THEME_KEY, t);
      persist({ theme: t });
    },
    [persist],
  );

  const setDensity = useCallback(
    (d: Density) => {
      setDensityState(d);
      localStorage.setItem(DENSITY_KEY, d);
      persist({ density: d });
    },
    [persist],
  );

  return (
    <ThemeCtx.Provider value={{ theme, density, resolvedTheme, setTheme, setDensity }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme(): Ctx {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error("ThemeProvider missing");
  return c;
}
