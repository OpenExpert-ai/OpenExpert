// SPDX-License-Identifier: MIT
import { Link, useRouterState } from "@tanstack/react-router";
import {
  MessagesSquare,
  Network,
  Plug,
  ScrollText,
  Building2,
  Layers,
  Loader2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMe, useUI, useWorkspace } from "@/lib/store";

const nav = [
  { to: "/expert", label: "Expert", icon: MessagesSquare },
  { to: "/experts", label: "Experts", icon: Network },
  { to: "/integrations", label: "Procesos e Integraciones", icon: Plug },
  { to: "/activity", label: "Registro de Actividad", icon: ScrollText },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { data: ws, isLoading, error } = useWorkspace();
  const { activeExpert, setActiveExpert } = useUI();
  const me = useMe(ws);
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="border-b border-border px-5 py-5">
          <div className="font-display text-2xl tracking-tight">OpenExpert</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Habla con tu empresa
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {nav.map((n) => {
            const active = path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
              >
                <n.icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 font-mono text-xs text-primary">
              {me?.name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{me?.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">Local</div>
            </div>
          </div>
        </div>
      </aside>
      {isLoading || !ws || !me ? (
        <div className="flex flex-1 items-center justify-center font-mono text-xs text-muted-foreground">
          {error ? (
            `Error: ${error.message}`
          ) : (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando espacio de trabajo…
            </>
          )}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:px-6">
            <div className="font-display text-lg md:hidden">OpenExpert</div>
            <label className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <select className="bg-transparent outline-none">
                <option className="bg-card">Nexora Tech S.L. · SaaS B2B</option>
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <select
                value={activeExpert}
                onChange={(e) => setActiveExpert(e.target.value)}
                className="bg-transparent outline-none"
              >
                {ws?.experts.map((e) => (
                  <option key={e.id} value={e.id} className="bg-card">
                    Experto · {e.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              LOCAL
            </span>
          </header>
          <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="whitespace-nowrap rounded px-2 py-1 text-xs text-muted-foreground"
                activeProps={{ className: "bg-accent text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <main className="flex-1">{children}</main>
        </div>
      )}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  desc,
  children,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-6 py-8">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">
          {eyebrow}
        </div>
        <h1 className="mt-2 font-display text-4xl tracking-tight">{title}</h1>
        {desc && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-2xl">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";
export const btnPrimary =
  "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40";
export const btnGhost =
  "rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground";
