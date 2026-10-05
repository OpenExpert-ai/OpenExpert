// SPDX-License-Identifier: MIT
import { Link, useRouterState } from "@tanstack/react-router";
import { MessagesSquare, Network, Plug, ScrollText, Layers, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useMe, useUI, useWorkspace } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/expert", label: "Expert", icon: MessagesSquare },
  { to: "/experts", label: "Experts", icon: Network },
  { to: "/integrations", label: "Procesos e Integraciones", icon: Plug },
  { to: "/activity", label: "Registro de Actividad", icon: ScrollText },
  { to: "/settings", label: "Configuración", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { data: ws, isLoading, error, refetch } = useWorkspace();
  const { activeExpert, setActiveExpert } = useUI();
  const me = useMe(ws);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useT();

  const navLink =
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar";
  const navLinkActive = "bg-accent text-foreground";

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        {t("Saltar al contenido")}
      </a>
      <aside className="sticky top-0 hidden h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="border-b border-sidebar-border px-5 py-5">
          <div className="font-display text-2xl tracking-tight">OpenExpert</div>
          <div className="mt-1 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            {t("Habla con tu empresa")}
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {nav.map((n) => {
            const active = path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(navLink, active && navLinkActive)}
                aria-current={active ? "page" : undefined}
              >
                <n.icon className={cn("size-4", active && "text-primary")} />
                {t(n.label)}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 font-mono text-xs text-primary">
              {me?.name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{me?.name}</div>
              <div className="font-mono text-[0.7rem] text-muted-foreground">{t("Local")}</div>
            </div>
          </div>
        </div>
      </aside>
      {isLoading || !ws || !me ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          {error ? (
            <>
              <div className="font-display text-lg">{t("No se pudo cargar tu espacio")}</div>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t(
                  "El servidor local no respondió. Comprueba que sigue en marcha e inténtalo de nuevo.",
                )}
              </p>
              <button onClick={() => refetch()} className={buttonVariants({ variant: "outline" })}>
                {t("Reintentar")}
              </button>
            </>
          ) : (
            <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <Spinner label={t("Cargando espacio de trabajo…")} />
              {t("Cargando espacio de trabajo…")}
            </span>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:px-6">
            <div className="font-display text-lg md:hidden">OpenExpert</div>
            <label className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ring/40">
              <Layers className="size-3.5 text-primary" />
              <span className="sr-only">{t("Experto activo")}</span>
              <select
                value={activeExpert}
                onChange={(e) => setActiveExpert(e.target.value)}
                className="cursor-pointer bg-transparent outline-none"
              >
                {ws.experts.map((e) => (
                  <option key={e.id} value={e.id}>
                    {t("Experto · {name}", { name: e.name })}
                  </option>
                ))}
              </select>
            </label>
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[0.7rem] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success" />
              {t("LOCAL")}
            </span>
          </header>
          <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="whitespace-nowrap rounded px-2 py-1 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                activeProps={{ className: "bg-accent text-foreground" }}
              >
                {t(n.label)}
              </Link>
            ))}
          </nav>
          <main id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {children}
          </main>
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
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-6 py-7">
      <div>
        <div className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </div>
        <h1 className="mt-1.5 font-display text-3xl tracking-tight sm:text-4xl">{title}</h1>
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
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle className="font-display text-2xl font-semibold tracking-tight">
          {title}
        </DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = buttonVariants();
export const btnGhost = buttonVariants({ variant: "outline" });
