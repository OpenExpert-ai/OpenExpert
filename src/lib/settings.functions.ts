// SPDX-License-Identifier: MIT
// Settings server functions: the single write path for the configuration
// panel. Reads/writes openexpert.json + secrets.json, mirrors the result into
// process.env and records every change in the activity log.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as ee from "./ee.server";
import { getDb, now, persist } from "@/lib/db.server";
import * as schema from "../../drizzle/schema";
import {
  aiSettings,
  aiUpdateSchema,
  paths,
  revealSecretValue,
  secretStatus,
  setRuntimeEnv,
  writeFileConfig,
  writeSecret,
} from "./config.server";

const OWNER_NAME = "Propietario local";

/* ------------------------------- AI / model ------------------------------ */

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const ai = aiSettings();
  return {
    ai,
    secrets: {
      googleApiKey: secretStatus("GOOGLE_API_KEY"),
      modelKey: secretStatus("OPENEXPERT_MODEL_KEY"),
      baseUrl: secretStatus("OPENEXPERT_BASE_URL"),
    },
    paths: paths(),
    runtime: runtimeInfo(),
  };
});

export const updateAiSettings = createServerFn({ method: "POST" })
  .validator((d) => aiUpdateSchema.parse(d))
  .handler(async ({ data }) => {
    writeFileConfig({
      modelProvider: data.provider,
      modelId: data.modelId,
      ollamaBaseUrl: data.ollamaBaseUrl,
      ai: {
        temperature: data.temperature,
        topP: data.topP,
        maxOutputTokens: data.maxOutputTokens,
      },
    });

    writeSecret("OPENEXPERT_BASE_URL", data.baseUrl === "" ? null : data.baseUrl);
    if (data.googleApiKey !== undefined) {
      writeSecret("GOOGLE_API_KEY", data.googleApiKey === "" ? null : data.googleApiKey);
    }
    if (data.modelKey !== undefined) {
      writeSecret("OPENEXPERT_MODEL_KEY", data.modelKey === "" ? null : data.modelKey);
    }

    // Mirror into the running process so no restart is needed.
    setRuntimeEnv("OPENEXPERT_MODEL_PROVIDER", data.provider);
    setRuntimeEnv("OPENEXPERT_MODEL_ID", data.modelId);
    setRuntimeEnv("OLLAMA_BASE_URL", data.ollamaBaseUrl === "" ? null : data.ollamaBaseUrl);
    setRuntimeEnv("OPENEXPERT_BASE_URL", data.baseUrl === "" ? null : data.baseUrl);
    if (data.googleApiKey !== undefined) {
      setRuntimeEnv("GOOGLE_API_KEY", data.googleApiKey === "" ? null : data.googleApiKey);
    }
    if (data.modelKey !== undefined) {
      setRuntimeEnv("OPENEXPERT_MODEL_KEY", data.modelKey === "" ? null : data.modelKey);
    }

    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Configuración",
      expert_id: "general",
      status: "ok",
      summary: `Modelo actualizado: ${data.provider}:${data.modelId}`,
      sources: ["Configuración"],
    });
    return { ok: true };
  });

async function fetchModels(): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const cfg = aiSettings();
  try {
    if (cfg.provider === "ollama") {
      const base = cfg.ollamaBaseUrl.replace(/\/+$/, "");
      const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) return { ok: false, models: [], error: `Ollama respondió ${r.status}` };
      const j = (await r.json()) as { models?: { name: string }[] };
      return { ok: true, models: (j.models ?? []).map((m) => m.name) };
    }
    if (cfg.provider === "openai-compatible") {
      const base = cfg.baseUrl.replace(/\/+$/, "");
      if (!base) return { ok: false, models: [], error: "Falta la base URL del endpoint." };
      const key = revealSecretValue("OPENEXPERT_MODEL_KEY") ?? "";
      const r = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) return { ok: false, models: [], error: `El endpoint respondió ${r.status}` };
      const j = (await r.json()) as { data?: { id: string }[] };
      return { ok: true, models: (j.data ?? []).map((m) => m.id) };
    }
    const key = revealSecretValue("GOOGLE_API_KEY");
    if (!key) return { ok: false, models: [], error: "Falta GOOGLE_API_KEY." };
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!r.ok) return { ok: false, models: [], error: `Google respondió ${r.status}` };
    const j = (await r.json()) as { models?: { name: string }[] };
    return { ok: true, models: (j.models ?? []).map((m) => m.name.replace(/^models\//, "")) };
  } catch (e) {
    return { ok: false, models: [], error: (e as Error).message };
  }
}

export const listModels = createServerFn({ method: "GET" }).handler(async () => fetchModels());

export const testProvider = createServerFn({ method: "GET" }).handler(async () => {
  const r = await fetchModels();
  return { ok: r.ok, count: r.models.length, error: r.error ?? null };
});

export const revealSecret = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        name: z.enum([
          "GOOGLE_API_KEY",
          "GOOGLE_CLIENT_ID",
          "GOOGLE_CLIENT_SECRET",
          "OPENEXPERT_MODEL_KEY",
          "OPENEXPERT_BASE_URL",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => ({ value: revealSecretValue(data.name) }));

/* ------------------------------ UI preferences --------------------------- */

export type UiSettings = {
  theme: "dark" | "light" | "system";
  density: "comfortable" | "compact";
  language: "es" | "en";
};

export const DEFAULT_UI: UiSettings = { theme: "dark", density: "comfortable", language: "es" };

const uiSettingsSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).optional(),
  density: z.enum(["comfortable", "compact"]).optional(),
  language: z.enum(["es", "en"]).optional(),
});

export const getUiSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { orm } = await getDb();
  const row = orm.select().from(schema.settings).where(eq(schema.settings.key, "ui")).all()[0];
  return { ...DEFAULT_UI, ...((row?.value as Partial<UiSettings>) ?? {}) };
});

export const setUiSettings = createServerFn({ method: "POST" })
  .validator((d) => uiSettingsSchema.parse(d))
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    const row = orm.select().from(schema.settings).where(eq(schema.settings.key, "ui")).all()[0];
    const current: UiSettings = {
      ...DEFAULT_UI,
      ...((row?.value as Partial<UiSettings>) ?? {}),
    };
    const next: UiSettings = {
      theme: data.theme ?? current.theme,
      density: data.density ?? current.density,
      language: data.language ?? current.language,
    };
    if (row) {
      orm
        .update(schema.settings)
        .set({ value: next, updatedAt: now() })
        .where(eq(schema.settings.key, "ui"))
        .run();
    } else {
      orm.insert(schema.settings).values({ key: "ui", value: next, updatedAt: now() }).run();
    }
    await persist();
    return next;
  });

/* -------------------------------- runtime -------------------------------- */

function runtimeInfo() {
  let version = "0.0.0";
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      version?: string;
    };
    version = pkg.version ?? "0.0.0";
  } catch {
    // ignore
  }
  return { version, node: process.version, port: process.env["PORT"] || "3000" };
}
