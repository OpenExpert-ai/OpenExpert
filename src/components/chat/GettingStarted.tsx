// SPDX-License-Identifier: MIT
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

const DISMISSED_KEY = "openexpert:getting-started-dismissed:v1";

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function GettingStarted({
  hasBusinessData,
  hasMessages,
}: {
  hasBusinessData: boolean;
  hasMessages: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(() => !hasMessages && !wasDismissed());
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      if (next) localStorage.removeItem(DISMISSED_KEY);
      else localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // The guide is still usable when browser storage is unavailable.
    }
  };
  return (
    <section className="mx-auto max-w-lg text-left">
      <button
        type="button"
        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        aria-expanded={open}
        aria-controls="getting-started-guide"
        onClick={toggle}
      >
        {open ? t("Ocultar primeros pasos") : t("Mostrar primeros pasos")}
      </button>
      {open && (
        <div
          id="getting-started-guide"
          className="mt-3 rounded-lg border border-border bg-card p-5"
        >
          <h2 className="text-sm font-medium">{t("Primeros pasos")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Puedes hacer estos pasos cuando quieras y volver a abrir esta guía desde el chat.")}
          </p>
          <ol className="mt-3 space-y-3 text-sm">
            <Step
              title={t("Elige tu modelo")}
              desc={t("Ollama, Gemini o tu propio endpoint.")}
              action={
                <Link
                  to="/settings/ai"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("Configurar")}
                </Link>
              }
            />
            <Step
              done={hasBusinessData}
              title={t("Añade tus datos")}
              desc={t("Importa un CSV, conecta un servicio o prueba datos de ejemplo.")}
              action={
                <Link
                  to="/settings/data"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("Gestionar datos")}
                </Link>
              }
            />
            <Step
              title={t("Pregunta lo que necesites")}
              desc={t("Las acciones sensibles te pedirán aprobación antes de ejecutarse.")}
            />
          </ol>
        </div>
      )}
    </section>
  );
}

function Step({
  done,
  title,
  desc,
  action,
}: {
  done?: boolean;
  title: string;
  desc: string;
  action?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${done ? "border-success/50 bg-success/10 text-success" : "border-border text-muted-foreground"}`}
        aria-hidden
      >
        {done ? (
          <Check className="size-3" />
        ) : (
          <span className="size-1.5 rounded-full bg-current" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-foreground">{title}</span>
          {action}
        </span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </li>
  );
}
