// SPDX-License-Identifier: MIT
// Settings server functions: the single write path for the configuration
// panel. Reads/writes openexpert.json + secrets.json, mirrors the result into
// process.env and records every change in the activity log.

import { eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z, ZodError } from "zod";
import { listProviderModels } from "@openexpert/openexpert/provider-models";
import {
  endpointOf,
  endpointSourceOf,
  providerKeyEnvOf,
  PROVIDER_KEY_VARS,
  type ModelProviderId,
} from "@openexpert/openexpert/model-provider";
import { APP_VERSION } from "./version";
import * as ee from "./ee.server";
import * as backup from "./backup.server";
import { getDb, now, persist } from "@/lib/db.server";
import * as schema from "../../drizzle/schema";
import {
  aiSettings,
  aiUpdateSchema,
  chatSettings,
  chatUpdateSchema,
  configProblemsMessage,
  diagnostics,
  envReport,
  parseOrExplain,
  paths,
  providerProbeSchema,
  providerViews,
  rawConfigText,
  resetFileConfig,
  revealSecretValue,
  setRuntimeEnv,
  writeFileConfig,
  writeProviderEndpoint,
  writeRawConfig,
  writeSecret,
  type ProviderProbeInput,
  type SecretName,
} from "./config.server";

const OWNER_NAME = "Propietario local";

/* ------------------------------- AI / model ------------------------------ */

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const ai = aiSettings();
  return {
    ai,
    // One entry per catalogue record, with the state of its key, its endpoint
    // and the models it knows: the panel renders this and nothing of its own.
    providers: providerViews(),
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
      ai: {
        temperature: data.temperature,
        topP: data.topP,
        maxOutputTokens: data.maxOutputTokens,
      },
    });

    // The endpoint belongs to the selected provider: it is written where that
    // record says (`writeProviderEndpoint`), never to another provider's slot.
    // `endpointSourceOf` gives the **variable**; `endpointOf` would give the
    // address itself, and using it here writes the URL as if it were a name.
    const endpointEnv = endpointSourceOf(data.provider);
    if (endpointEnv) writeProviderEndpoint(endpointEnv, data.endpoint);

    // One key per provider, each in its own variable: writing the key of one
    // never touches what another provider stored.
    const written: string[] = [];
    for (const [id, value] of Object.entries(data.providerKeys ?? {})) {
      const env = providerKeyEnvOf(id);
      if (!env) continue;
      writeSecret(env, value === "" ? null : value);
      setRuntimeEnv(env, value === "" ? null : value);
      written.push(env);
    }

    // Mirror into the running process so no restart is needed.
    setRuntimeEnv("OPENEXPERT_MODEL_PROVIDER", data.provider);
    setRuntimeEnv("OPENEXPERT_MODEL_ID", data.modelId);
    if (endpointEnv) setRuntimeEnv(endpointEnv, data.endpoint === "" ? null : data.endpoint);

    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Configuración",
      expert_id: "general",
      status: "ok",
      summary: `Modelo actualizado: ${data.provider}:${data.modelId}${
        written.length ? ` (claves: ${written.join(", ")})` : ""
      }`,
      sources: ["Configuración"],
    });
    return { ok: true };
  });

/**
 * Which models the active provider serves. The work is the engine's
 * (`listProviderModels`), so the panel, the CLI and the doctor ask the same
 * question the same way — including the provider's own way of taking the key.
 *
 * `probe` says **what to ask**: with nothing, the question is about the
 * stored configuration, which is what the CLI and `doctor` ask. With values,
 * the question is about those, which is what the panel asks when the owner
 * has written a provider, an endpoint or a key that are not saved yet.
 *
 * The key is the delicate part: it is used for the question and dropped. It
 * never reaches `secrets.json` nor `openexpert.json`, because probing is not
 * saving. The engine reads the key from the environment it is handed, so the
 * call gets a **copy** of the environment with that key in the variable the
 * provider's record declares: the running process keeps the stored key, and
 * the next call is about the stored configuration again.
 *
 * `source` tells the caller which of the two it was, so the panel can say so
 * instead of leaving the owner guessing whether the answer was about what he
 * just wrote or about what is on disk.
 */
async function fetchModels(probe?: ProviderProbeInput): Promise<{
  ok: boolean;
  models: string[];
  error?: string;
  provider: string;
  source: "stored" | "probe";
}> {
  const cfg = aiSettings();
  const provider: ModelProviderId = probe?.provider ?? cfg.provider;

  // The endpoint only counts for the providers whose address the owner points
  // somewhere: a record with a fixed address keeps it, because that is where
  // its own protocol lives.
  const endpointEnv = endpointSourceOf(provider);
  const storedEndpoint = endpointOf(provider);
  const endpoint = probe?.endpoint && endpointEnv ? probe.endpoint : undefined;

  // The key to ask with, and the variable that holds it for this provider.
  const key = probe?.key ? probe.key : undefined;
  const keyEnv = providerKeyEnvOf(provider);
  const storedKey = keyEnv ? revealSecretValue(keyEnv) : null;

  // The environment the engine will read: the running one, with the key that
  // answers this question put in the variable the provider's record declares.
  // A copy, so the running process keeps the stored key and the next call is
  // about the stored configuration again. The key is read from the same place
  // the panel reads it (the environment, or `secrets.json` behind it), so a
  // probe with no key of its own asks with the stored one.
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (keyEnv) {
    const answer = key ?? storedKey;
    if (answer) env[keyEnv] = answer;
  }

  const listed = await listProviderModels(provider, {
    env,
    ...(endpoint ? { endpoint } : {}),
  });

  // Whether the question was about what the owner wrote or about what is
  // stored: the same provider, the same endpoint and the same key (or none of
  // them) means the stored configuration, and the panel says so.
  const source =
    provider !== cfg.provider ||
    (endpoint !== undefined && endpoint !== storedEndpoint) ||
    (key !== undefined && key !== storedKey)
      ? "probe"
      : "stored";

  return {
    ok: listed.ok,
    models: listed.models,
    ...(listed.error ? { error: listed.error } : {}),
    provider,
    source,
  };
}

export const listModels = createServerFn({ method: "POST" })
  .validator((d) => providerProbeSchema.parse(d))
  .handler(async ({ data }) => fetchModels(data));

export const testProvider = createServerFn({ method: "POST" })
  .validator((d) => providerProbeSchema.parse(d))
  .handler(async ({ data }) => {
    const r = await fetchModels(data);
    return {
      ok: r.ok,
      count: r.models.length,
      error: r.error ?? null,
      provider: r.provider,
      source: r.source,
    };
  });

/**
 * Returns a stored secret so the local settings panel can show it on demand.
 * This is intentional in the single-owner edition: the browser is trusted and
 * the server must not be exposed beyond `localhost`. See docs/en/04-security.md.
 */
/**
 * Secrets the panel may read on demand: every provider key the catalogue
 * declares, plus the identifiers it also edits. The allow-list is built from
 * the catalogue, so a provider added there is readable without touching this.
 */
const REVEALABLE: ReadonlySet<string> = new Set<string>([
  ...PROVIDER_KEY_VARS,
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "OPENEXPERT_BASE_URL",
]);

export const revealSecret = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        name: z.string().refine((n) => REVEALABLE.has(n), { message: "Secreto no válido" }),
      })
      .parse(d),
  )
  // The allow-list above is what makes this safe to widen; the cast only tells
  // the type system what the refinement already proved.
  .handler(async ({ data }) => ({ value: revealSecretValue(data.name as SecretName) }));

/* ------------------------------ chat / agents ---------------------------- */

export const getChatSettings = createServerFn({ method: "GET" }).handler(async () =>
  chatSettings(),
);

export const updateChatSettings = createServerFn({ method: "POST" })
  // El panel imprime el `message` del error en el toast (`settings.chat.tsx`),
  // así que el rechazo tiene que ser una frase con la ruta del campo, no el
  // volcado de Zod. El `chat` va como raíz porque este formulario valida esa
  // rama del fichero y el mensaje tiene que nombrar el campo igual que la
  // restauración de una copia (`chat.maxSteps`).
  .validator((d) => parseOrExplain(chatUpdateSchema, d, "chat"))
  .handler(async ({ data }) => {
    writeFileConfig({ chat: data });
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Configuración",
      expert_id: "general",
      status: "ok",
      summary: `Ajustes de chat actualizados (guardia: ${data.injectionGuard ? "activada" : "desactivada"}, retención: ${data.retentionDays} días)`,
      sources: ["Configuración"],
    });
    return { ok: true };
  });

/* -------------------------------- advanced ------------------------------- */

export const getAdvanced = createServerFn({ method: "GET" }).handler(async () => ({
  raw: rawConfigText(),
  env: envReport(),
  diagnostics: diagnostics(),
}));

export const saveRawConfig = createServerFn({ method: "POST" })
  .validator((d) => z.object({ content: z.string().max(100_000) }).parse(d))
  .handler(async ({ data }) => {
    try {
      writeRawConfig(data.content);
    } catch (e) {
      // `writeRawConfig` valida con `fileConfigSchema`, y el `ZodError` trae el
      // volcado JSON en su `message`. Este texto es el que el editor en crudo
      // enseña en el toast (`settings.advanced.tsx`), así que se sustituye por
      // las mismas frases que da la restauración de una copia.
      throw new Error(
        e instanceof ZodError
          ? configProblemsMessage(e)
          : e instanceof Error
            ? e.message
            : "JSON inválido",
        { cause: e },
      );
    }
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Configuración",
      expert_id: "general",
      status: "ok",
      summary: "openexpert.json editado manualmente",
      sources: ["Configuración"],
    });
    return { ok: true };
  });

export const resetConfig = createServerFn({ method: "POST" }).handler(async () => {
  resetFileConfig();
  await ee.logActivity({
    actor: "human",
    actor_name: OWNER_NAME,
    type: "Configuración",
    expert_id: "general",
    status: "ok",
    summary: "openexpert.json restaurado a valores por defecto",
    sources: ["Configuración"],
  });
  return { ok: true };
});

/* ---------------------------------- data --------------------------------- */

export const getDataStats = createServerFn({ method: "GET" }).handler(async () =>
  backup.dataStats(),
);

export const importBackup = createServerFn({ method: "POST" })
  .validator((d) => z.object({ content: z.string().min(2).max(200_000_000) }).parse(d))
  .handler(async ({ data }) => {
    let restored: backup.RestoreResult;
    try {
      restored = await backup.restoreBackup(data.content);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : "Copia no válida", { cause: e });
    }
    const { applied, missing, backupPath } = restored;
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Configuración",
      expert_id: "general",
      status: "ok",
      summary:
        `Copia restaurada (${applied.join(", ")})` +
        (missing.length ? `; no incluidos en la copia: ${missing.join(", ")}` : ""),
      sources: ["Copia de seguridad"],
    });
    return { applied, missing, backupPath };
  });

export const clearChatHistory = createServerFn({ method: "POST" }).handler(async () => {
  const n = await backup.clearChatHistory();
  await ee.logActivity({
    actor: "human",
    actor_name: OWNER_NAME,
    type: "Configuración",
    expert_id: "general",
    status: "ok",
    summary: `Historial de chat borrado (${ee.countPhrase(n, "mensaje", "mensajes")})`,
    sources: ["Configuración"],
  });
  return { removed: n };
});

export const vacuumDb = createServerFn({ method: "POST" }).handler(async () => {
  await backup.vacuumDb();
  await ee.logActivity({
    actor: "human",
    actor_name: OWNER_NAME,
    type: "Configuración",
    expert_id: "general",
    status: "ok",
    summary: "Base de datos compactada (VACUUM)",
    sources: ["Configuración"],
  });
  return { ok: true };
});

export const resetData = createServerFn({ method: "POST" }).handler(async () => {
  await backup.resetData();
  await ee.logActivity({
    actor: "human",
    actor_name: OWNER_NAME,
    type: "Configuración",
    expert_id: "general",
    status: "ok",
    summary: "Datos restaurados a estado inicial (re-sembrado)",
    sources: ["Configuración"],
  });
  return { ok: true };
});

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
  // The product has one version and it is the package's (`@/lib/version`), so the
  // interface never reports a number of its own.
  return { version: APP_VERSION, node: process.version, port: process.env["PORT"] || "3000" };
}
