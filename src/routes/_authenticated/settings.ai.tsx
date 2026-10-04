// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, Loader2, PlugZap, RefreshCw } from "lucide-react";
import { btnGhost, btnPrimary, inputCls } from "@/components/AppShell";
import { useT } from "@/lib/i18n";
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

type Provider = "google" | "ollama" | "openai-compatible";

const SOURCE_LABEL: Record<string, string> = {
  env: "variable de entorno",
  file: "openexpert.json",
  secrets: "secrets.json",
  default: "valor por defecto",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

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
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function AiSettings() {
  const get = useServerFn(getSettings);
  const save = useServerFn(updateAiSettings);
  const list = useServerFn(listModels);
  const test = useServerFn(testProvider);
  const reveal = useServerFn(revealSecret);
  const qc = useQueryClient();
  const { t } = useT();

  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => get() });

  const [provider, setProvider] = useState<Provider>("ollama");
  const [modelId, setModelId] = useState("");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434");
  const [baseUrl, setBaseUrl] = useState("");
  const [temperature, setTemperature] = useState(0.2);
  const [topP, setTopP] = useState(1);
  const [maxOutputTokens, setMaxOutputTokens] = useState(4096);
  const [googleKeyDraft, setGoogleKeyDraft] = useState<string | null>(null);
  const [modelKeyDraft, setModelKeyDraft] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"save" | "list" | "test" | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    setProvider(data.ai.provider);
    setModelId(data.ai.modelId);
    setOllamaBaseUrl(data.ai.ollamaBaseUrl || "http://localhost:11434");
    setBaseUrl(data.ai.baseUrl || "");
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

  const onSave = async () => {
    setBusy("save");
    try {
      await save({
        data: {
          provider,
          modelId: modelId.trim(),
          ollamaBaseUrl: provider === "ollama" ? ollamaBaseUrl.trim() : "",
          baseUrl: provider === "openai-compatible" ? baseUrl.trim() : "",
          temperature,
          topP,
          maxOutputTokens,
          ...(googleKeyDraft !== null ? { googleApiKey: googleKeyDraft } : {}),
          ...(modelKeyDraft !== null ? { modelKey: modelKeyDraft } : {}),
        },
      });
      toast.success(t("Configuración guardada"));
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
        setModels(r.models);
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

  const onReveal = async (name: "GOOGLE_API_KEY" | "OPENEXPERT_MODEL_KEY") => {
    try {
      const r = await reveal({ data: { name } });
      if (r.value) toast.message(`${name}: ${r.value}`);
      else toast.info(t("No hay valor definido"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const keyStatus = (s: { set: boolean; source: string }) =>
    s.set ? `${t("Definida")} (${t(SOURCE_LABEL[s.source] ?? s.source)})` : t("No definida");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Card
        title={t("Proveedor de IA")}
        desc={t("Elige dónde se ejecuta el modelo. Ollama es local y no necesita claves.")}
      >
        <Field label={t("Proveedor")}>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className={inputCls}
          >
            <option value="ollama">{t("Ollama (local)")}</option>
            <option value="google">{t("Google Gemini")}</option>
            <option value="openai-compatible">{t("OpenAI-compatible (BYOK)")}</option>
          </select>
          <span className="block text-xs text-muted-foreground">
            {t("Origen actual:")}{" "}
            {t(SOURCE_LABEL[data.ai.providerSource] ?? data.ai.providerSource)}
          </span>
        </Field>

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
              placeholder="llama3.1"
            />
            <datalist id="model-options">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={onList}
              disabled={busy !== null}
              className={`${btnGhost} flex shrink-0 items-center gap-1.5`}
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

        {provider === "ollama" && (
          <Field label={t("URL de Ollama")}>
            <input
              value={ollamaBaseUrl}
              onChange={(e) => setOllamaBaseUrl(e.target.value)}
              className={inputCls}
              placeholder="http://localhost:11434"
            />
          </Field>
        )}

        {provider === "openai-compatible" && (
          <>
            <Field
              label={t("Base URL")}
              hint={t("Endpoint compatible con OpenAI (con /v1 al final).")}
            >
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className={inputCls}
                placeholder="https://api.ejemplo.com/v1"
              />
            </Field>
            <Field label={t("API key")} hint={keyStatus(data.secrets.modelKey)}>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={modelKeyDraft ?? ""}
                  onChange={(e) => setModelKeyDraft(e.target.value)}
                  className={inputCls}
                  placeholder={t("Dejar vacío para no cambiarla")}
                />
                <button
                  type="button"
                  onClick={() => onReveal("OPENEXPERT_MODEL_KEY")}
                  className={`${btnGhost} shrink-0`}
                  title={t("Revelar")}
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setModelKeyDraft("")}
                  className={`${btnGhost} shrink-0`}
                  title={t("Borrar")}
                >
                  {t("Borrar")}
                </button>
              </div>
            </Field>
          </>
        )}

        {provider === "google" && (
          <Field label={t("API key de Gemini")} hint={keyStatus(data.secrets.googleApiKey)}>
            <div className="flex gap-2">
              <input
                type="password"
                value={googleKeyDraft ?? ""}
                onChange={(e) => setGoogleKeyDraft(e.target.value)}
                className={inputCls}
                placeholder={t("Dejar vacío para no cambiarla")}
              />
              <button
                type="button"
                onClick={() => onReveal("GOOGLE_API_KEY")}
                className={`${btnGhost} shrink-0`}
                title={t("Revelar")}
              >
                <Eye className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setGoogleKeyDraft("")}
                className={`${btnGhost} shrink-0`}
                title={t("Borrar")}
              >
                {t("Borrar")}
              </button>
            </div>
          </Field>
        )}
      </Card>

      <Card
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
          className={`${btnGhost} flex items-center gap-1.5`}
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
