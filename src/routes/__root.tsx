// SPDX-License-Identifier: MIT
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportAppError } from "../lib/error-reporting";
import { UIProvider } from "../lib/store";
import { ThemeProvider, useTheme } from "../lib/theme";
import { I18nProvider, useT } from "../lib/i18n";
import { Toaster } from "../components/ui/sonner";
import { buttonVariants } from "../components/ui/button";
import { getClientConfig } from "../lib/data.functions";

function NotFoundComponent() {
  const { t } = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("Página no encontrada")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("La página que buscas no existe o se ha movido.")}
        </p>
        <div className="mt-6">
          <Link to="/" className={buttonVariants()}>
            {t("Volver al inicio")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const { t } = useT();
  useEffect(() => {
    reportAppError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("Esta página no se pudo cargar")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Algo ha fallado. Prueba a recargar o vuelve al inicio.")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className={buttonVariants()}
          >
            {t("Reintentar")}
          </button>
          <a href="/" className={buttonVariants({ variant: "outline" })}>
            {t("Volver al inicio")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "OpenExpert — Habla con tu empresa" },
      {
        name: "description",
        content: "Sistema operativo empresarial con agentes de IA, Experts y auditoría.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head>
        <HeadContent />
        {/* Apply the stored theme before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("openexpert:theme")||"dark";var d=localStorage.getItem("openexpert:density")||"comfortable";var r=t==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):t;var e=document.documentElement;e.classList.toggle("dark",r==="dark");e.classList.toggle("density-compact",d==="compact");}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={resolvedTheme} />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    getClientConfig()
      .then((c) => {
        (window as unknown as { __OPENEXPERT_PICKER_KEY__?: string }).__OPENEXPERT_PICKER_KEY__ =
          c.pickerKey;
        (
          window as unknown as { __OPENEXPERT_PICKER_APP_ID__?: string }
        ).__OPENEXPERT_PICKER_APP_ID__ = c.pickerAppId;
        (
          window as unknown as { __OPENEXPERT_GOOGLE_CLIENT_ID__?: string }
        ).__OPENEXPERT_GOOGLE_CLIENT_ID__ = c.googleClientId;
        (window as unknown as { __OPENEXPERT_PRIVACY_URL__?: string }).__OPENEXPERT_PRIVACY_URL__ =
          c.privacyUrl;
      })
      .catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <UIProvider>
        <ThemeProvider>
          <I18nProvider>
            <Outlet />
            <ThemedToaster />
          </I18nProvider>
        </ThemeProvider>
      </UIProvider>
    </QueryClientProvider>
  );
}
