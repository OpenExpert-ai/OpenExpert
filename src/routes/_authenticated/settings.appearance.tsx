// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useTheme, type Density, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/settings/appearance")({
  component: AppearanceSettings,
});

function Card({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="font-display text-xl">{title}</h2>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Option<T extends string>({
  value,
  current,
  onSelect,
  title,
  desc,
}: {
  value: T;
  current: T;
  onSelect: (v: T) => void;
  title: string;
  desc: string;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`flex items-start justify-between gap-4 rounded-md border px-4 py-3 text-left transition-colors ${
        active ? "border-primary bg-primary/10" : "border-border hover:bg-accent/60"
      }`}
    >
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
      <span
        className={`mt-1 h-3 w-3 shrink-0 rounded-full border ${
          active ? "border-primary bg-primary" : "border-muted-foreground/40"
        }`}
      />
    </button>
  );
}

function AppearanceSettings() {
  const { theme, density, setTheme, setDensity } = useTheme();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Card title="Tema" desc="Se aplica al instante y se guarda en tu equipo.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Option<Theme>
            value="dark"
            current={theme}
            onSelect={setTheme}
            title="Oscuro"
            desc="Interfaz oscura"
          />
          <Option<Theme>
            value="light"
            current={theme}
            onSelect={setTheme}
            title="Claro"
            desc="Interfaz clara"
          />
          <Option<Theme>
            value="system"
            current={theme}
            onSelect={setTheme}
            title="Sistema"
            desc="Según tu sistema operativo"
          />
        </div>
      </Card>

      <Card title="Densidad" desc="Controla el tamaño base del texto.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Option<Density>
            value="comfortable"
            current={density}
            onSelect={setDensity}
            title="Cómoda"
            desc="Texto a 15 px"
          />
          <Option<Density>
            value="compact"
            current={density}
            onSelect={setDensity}
            title="Compacta"
            desc="Texto a 14 px"
          />
        </div>
      </Card>
    </div>
  );
}
