// SPDX-License-Identifier: MIT
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso — OpenExpert" },
      {
        name: "description",
        content: "Inicia sesión en OpenExpert, el sistema operativo de IA de tu empresa.",
      },
      { property: "og:title", content: "Acceso — OpenExpert" },
      {
        property: "og:description",
        content: "Habla con tu empresa. Inicia sesión para continuar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();

  useEffect(() => {
    const check = async (email: string | undefined) => {
      if (!email) return;
      nav({ to: "/expert" });
    };
    supabase.auth.getUser().then(({ data }) => check(data.user?.email));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      void check(s?.user.email);
    });
    return () => sub.subscription.unsubscribe();
  }, [nav]);

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth` },
    });
    // On success the browser navigates to Google, so we only ever land here on failure.
    if (error)
      toast.error("No se pudo iniciar sesión con Google. Solo pueden entrar cuentas invitadas.");
  };

  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r border-border bg-sidebar p-12 lg:flex">
        <div className="font-display text-3xl">OpenExpert</div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            Enterprise AI Workstation
          </div>
          <h1 className="mt-4 font-display text-6xl leading-[1.05]">
            Habla con
            <br />
            tu empresa.
          </h1>
          <p className="mt-6 max-w-md text-sm text-muted-foreground">
            Agentes de IA con contexto aislado por área, control de acceso por roles, confirmación
            humana en acciones sensibles y auditoría reversible.
          </p>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          RBAC · EXPERTS · AUDIT TRAIL · SNAPSHOTS
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-4xl">Iniciar sesión</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Acceso privado. Solo la cuenta de Google autorizada puede entrar.
          </p>
          <button
            onClick={google}
            className="mt-8 w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm hover:border-primary/50"
          >
            Continuar con Google
          </button>
        </div>
      </div>
    </div>
  );
}
