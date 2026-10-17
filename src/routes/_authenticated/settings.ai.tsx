// SPDX-License-Identifier: MIT
// Ajustes → Modelo e IA.
//
// La pantalla no tiene lista de proveedores propia: recorre la que le manda el
// servidor (una entrada por ficha del catálogo) y dibuja, para el elegido, su
// clave —con el nombre de la variable donde se guarda—, su endpoint y sus
// modelos. Así, dar de alta Anthropic es dar de alta una ficha: aparece su campo
// de clave, se guarda en su variable y no toca la de ningún otro.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, PlugZap, RefreshCw } from "lucide-react";
import { btnGhost, btnPrimary, inputCls } from "@/components/AppShell";
import { SettingsCard as Card, SettingsField as Field } from "@/components/ui/settings";
import { useT } from "@/lib/i18n";
import type { ModelProviderId } from "@openexpert/opencore/model-provider";
import {
  getSettings,
  listModels,
  revealSecret,
  testProvider,
  updateAiSettings,
} from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/settings/ai")({
  component: AiSettings,
});

type ProviderView = Awaited<ReturnType<typeof getSettings>>["providers"][number];

const SOURCE_LABEL: Record<string, string> = {
  env: "variable de entorno",
  file: "openexpert.json",
  secrets: "secrets.json",
  default: "valor por defecto",
};

function AiSettings() {
  const get = useServerFn(getSettings);
  const save = useServerFn(updateAiSettings);
  const list = useServerFn(listModels);
  const test = useServerFn(testProvider);
  const reveal = useServerFn(revealSecret);
  const qc = useQueryClient();
  const { t } = useT();

  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => get() });

  const [provider, setProvider] = useState<string>("ollama");
  const [modelId, setModelId] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [temperature, setTemperature] = useState(0.5);
  const [topP, setTopP] = useState(1);
  const [maxOutputTokens, setMaxOutputTokens] = useState(4096);
  const [listed, setListed] = useState<string[]>([]);
  const [busy, setBusy] = useState<"save" | "list" | "test" | null>(null);
  const loaded = useRef(false);

  const view: ProviderView | undefined = data?.providers.find((p) => p.id === provider);

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    const current = data.providers.find((p) => p.id === data.ai.provider);
    setProvider(data.ai.provider);
    setModelId(data.ai.modelId);
    setEndpoint(current?.endpoint.value ?? "");
    setTemperature(data.ai.ai.temperature);
    setTopP(data.ai.ai.topP);
    setMaxOutputTokens(data.ai.ai.maxOutputTokens);
  }, [data]);

  if (!data) {
    return (
      <div className="flex items-center gap-2 p-6 font-mono text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("Cargando configuración…")}
      </div>
    );
  }

  const keyStatus = (key: { set: boolean; source: string } | null) => {
    if (!key) return t("Sin clave (local)");
    return key.set
      ? `${t("Definida")} (${t(SOURCE_LABEL[key.source] ?? key.source)})`
      : t("No definida");
  };

  /**
   * Elegir proveedor no arrastra la elección del anterior: si el modelo guardado
   * no es de este proveedor, se propone el suyo (el primero que conoce). El
   * genérico no trae ninguno, y ahí toca escribir cuál.
   */
  const onPick = (next: ProviderView) => {
    if (next.id === provider) return;
    setProvider(next.id);
    setEndpoint(next.endpoint.value);
    setListed([]);
    setKeyDrafts({});
    if (!next.models.includes(modelId)) setModelId(next.models[0] ?? "");
  };

  const currentDraft = view?.key ? (keyDrafts[view.id] ?? "") : "";
  const keyName = view?.key?.name ?? "";

  const onSave = async () => {
    if (!view) return;
    setBusy("save");
    try {
      await save({
        data: {
          provider: view.id as ModelProviderId,
          modelId: modelId.trim(),
          endpoint: view.endpoint.env ? endpoint.trim() : "",
          temperature,
          topP,
          maxOutputTokens,
          // Solo se manda la clave que se ha tocado: dejar el campo en blanco
          // sin escribir nada no debe borrar la que ya había.
          ...(keyName && keyDrafts[view.id] !== undefined
            ? { providerKeys: { [view.id]: keyDrafts[view.id] ?? "" } }
            : {}),
        },
      });
      toast.success(t("Configuración guardada"));
      setKeyDrafts({});
      loaded.current = false;
      await qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error((e as Error).message || t("No se pudo guardar"));
    } finally {
      setBusy(null);
    }
  };

  const onList = async () => {
    setBusy("list");
    try {
      const r = await list();
      if (!r.ok) toast.error(r.error ?? t("No se pudieron listar los modelos"));
      else if (!r.models.length) toast.info(t("El proveedor no devolvió modelos"));
      else {
        setListed(r.models);
        toast.success(t("{n} modelos disponibles", { n: r.models.length }));
      }
    } finally {
      setBusy(null);
    }
  };

  const onTest = async () => {
    setBusy("test");
    try {
      const r = await test();
      if (r.ok) toast.success(t("Conexión correcta · {n} modelos", { n: r.count }));
      else toast.error(r.error ?? t("No se pudo conectar"));
    } finally {
      setBusy(null);
    }
  };

  const onReveal = async (name: string) => {
    try {
      const r = await reveal({ data: { name } });
      if (!r.value) {
        toast.info(t("No hay valor definido"));
        return;
      }
      await navigator.clipboard.writeText(r.value);
      toast.success(t("Copiada al portapapeles"));
    } catch (e) {
      toast.error((e as Error).message || t("No se pudo copiar"));
    }
  };

  // Lo que el proveedor conoce más lo que acaba de responder su endpoint.
  const options = [...(view?.models ?? []), ...listed].filter((m, i, all) => all.indexOf(m) === i);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Card
        bodyClassName="mt-5 space-y-3"
        title={t("Proveedor de IA")}
        desc={t(
          "Elige dónde se ejecuta el modelo. Cada proveedor guarda su propia clave: cambiar de uno a otro no borra la del anterior.",
        )}
      >
        <ul className="space-y-2" role="list">
          {data.providers.map((p) => {
            const active = p.id === provider;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  aria-pressed={active}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{t(p.name)}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                        p.key
                          ? p.key.set
                            ? "border-success/40 text-success"
                            : "border-destructive/40 text-destructive"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {keyStatus(p.key)}
                    </span>
                  </span>
                  {p.note && (
                    <span className="mt-1 block text-xs text-muted-foreground">{t(p.note)}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {view && (
          <div className="space-y-5 border-t border-border pt-5">
            <p className="text-xs text-muted-foreground">
              {t("Elegido: {a}. Su clave se guarda como {b}.", {
                a: t(view.name),
                b: keyName || t("ninguna (no usa)"),
              })}
            </p>

            {view.key && (
              <Field
                label={t("Clave de API")}
                hint={`${keyStatus(view.key)} · ${t("variable")}: ${view.key.name}`}
              >
                <div className="flex flex-wrap gap-2">
                  <input
                    type="password"
                    autoComplete="off"
                    value={currentDraft}
                    onChange={(e) => setKeyDrafts({ ...keyDrafts, [view.id]: e.target.value })}
                    className={`${inputCls} min-w-48 flex-1`}
                    placeholder={view.key.set ? t("Dejar vacío para no cambiarla") : view.key.name}
                  />
                  <button
                    type="button"
                    onClick={() => onReveal(view.key!.name)}
                    className={`${btnGhost} shrink-0`}
                    title={t("Copiar")}
                  >
                    <Copy className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setKeyDrafts({ ...keyDrafts, [view.id]: "" })}
                    className={`${btnGhost} shrink-0`}
                  >
                    {t("Borrar")}
                  </button>
                </div>
                {view.keyUrl && (
                  <a
                    href={view.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {t("Obtener una clave")} <ExternalLink className="size-3" />
                  </a>
                )}
              </Field>
            )}

            {view.endpoint.env ? (
              <Field
                label={t("Endpoint")}
                hint={[
                  view.baseUrlHint ? t(view.baseUrlHint) : null,
                  `${t("En uso")}: ${view.endpoint.inUse}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <input
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className={inputCls}
                  placeholder={view.endpoint.fallback ?? "https://…/v1"}
                />
              </Field>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("Endpoint del proveedor:")} <code>{view.endpoint.inUse}</code>
              </p>
            )}

            {view.sessionHeader && (
              <p className="text-xs text-muted-foreground">
                {t("Este proveedor pide la cabecera {h} en cada petición.", {
                  h: view.sessionHeader,
                })}
              </p>
            )}

            <Field
              label={t("Modelo")}
              hint={t("Identificador del modelo tal y como lo conoce el proveedor.")}
            >
              <div className="flex gap-2">
                <input
                  list="model-options"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className={inputCls}
                  placeholder={view.models[0] ?? "nombre-del-modelo"}
                />
                <datalist id="model-options">
                  {options.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <button
                  type="button"
                  onClick={onList}
                  disabled={busy !== null}
                  className={`${btnGhost} shrink-0 items-center gap-1.5`}
                >
                  {busy === "list" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {t("Listar")}
                </button>
              </div>
            </Field>
          </div>
        )}
      </Card>

      <Card
        bodyClassName="mt-5 space-y-5"
        title={t("Parámetros de muestreo")}
        desc={t("Controlan cómo de creativo y largo es el modelo.")}
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Temperature">
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label={t("Top P")}>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={topP}
              onChange={(e) => setTopP(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label={t("Máx. tokens")}>
            <input
              type="number"
              min={1}
              step={256}
              value={maxOutputTokens}
              onChange={(e) => setMaxOutputTokens(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onSave} disabled={busy !== null} className={btnPrimary}>
          {busy === "save" ? t("Guardando…") : t("Guardar cambios")}
        </button>
        <button
          onClick={onTest}
          disabled={busy !== null}
          className={`${btnGhost} items-center gap-1.5`}
        >
          {busy === "test" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlugZap className="h-4 w-4" />
          )}
          {t("Probar conexión")}
        </button>
        <span className="text-xs text-muted-foreground">
          {t("Se guarda en {a} y {b}.", { a: "openexpert.json", b: "secrets.json" })}
        </span>
      </div>
    </div>
  );
}
