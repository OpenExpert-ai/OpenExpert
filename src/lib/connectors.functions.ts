// SPDX-License-Identifier: MIT
// Optional connector setup and sync. The token is stored only after a sync
// succeeds, so a typo does not leave a broken integration marked as connected.
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, persist } from "./db.server";
import * as ee from "./ee.server";
import * as schema from "../../drizzle/schema";
import { readSecrets, setRuntimeEnv, writeSecret } from "./config.server";
import { syncHolded, syncPipedrive } from "./connectors.server";

const CONNECTORS = ["pipedrive", "holded"] as const;
type ConnectorId = (typeof CONNECTORS)[number];

const SECRET: Record<ConnectorId, string> = {
  pipedrive: "PIPEDRIVE_API_TOKEN",
  holded: "HOLDED_API_KEY",
};

export const getConnectorStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { orm } = await getDb();
  const secrets = readSecrets();
  const rows = orm.select().from(schema.integrations).all();
  return CONNECTORS.map((id) => {
    const row = rows.find((r) => r.id === id);
    return {
      id,
      name: row?.name ?? (id === "pipedrive" ? "Pipedrive" : "Holded"),
      connected: row?.connected ?? false,
      lastSync: row?.lastSync ?? null,
      entities: row?.entities ?? [],
      configured: Boolean(secrets[SECRET[id]]),
    };
  });
});

export const connectPipedrive = createServerFn({ method: "POST" })
  .validator((d) => z.object({ token: z.string().trim().min(10).max(300) }).parse(d))
  .handler(async ({ data }) => {
    const result = await syncPipedrive(data.token);
    writeSecret("PIPEDRIVE_API_TOKEN", data.token);
    setRuntimeEnv("PIPEDRIVE_API_TOKEN", data.token);
    return result;
  });

export const connectHolded = createServerFn({ method: "POST" })
  .validator((d) => z.object({ key: z.string().trim().min(10).max(300) }).parse(d))
  .handler(async ({ data }) => {
    const result = await syncHolded(data.key);
    writeSecret("HOLDED_API_KEY", data.key);
    setRuntimeEnv("HOLDED_API_KEY", data.key);
    return result;
  });

export const syncConnector = createServerFn({ method: "POST" })
  .validator((d) => z.object({ id: z.enum(CONNECTORS) }).parse(d))
  .handler(async ({ data }) => {
    const secret = readSecrets()[SECRET[data.id]];
    if (!secret) throw new Error("Falta la clave del conector; vuelve a conectarlo.");
    return data.id === "pipedrive" ? syncPipedrive(secret) : syncHolded(secret);
  });

export const disconnectConnector = createServerFn({ method: "POST" })
  .validator((d) => z.object({ id: z.enum(CONNECTORS) }).parse(d))
  .handler(async ({ data }) => {
    writeSecret(SECRET[data.id], null);
    setRuntimeEnv(SECRET[data.id], null);
    const { orm } = await getDb();
    orm
      .update(schema.integrations)
      .set({ connected: false, entities: [], lastSync: null })
      .where(eq(schema.integrations.id, data.id))
      .run();
    await persist();
    await ee.logActivity({
      actor: "human",
      actor_name: "Propietario local",
      type: "Integración",
      expert_id: "general",
      status: "ok",
      summary: `Desconectado ${data.id === "pipedrive" ? "Pipedrive" : "Holded"}`,
      sources: ["Integraciones"],
    });
    return { ok: true };
  });
