// SPDX-License-Identifier: MIT
// Server functions: the single write path and the workspace read model.
// Local SQLite, single owner (no auth, no RBAC).

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as ee from "./ee.server";
import { chatSettings } from "@/lib/config.server";
import { getDb, now, persist } from "@/lib/db.server";
import * as schema from "../../drizzle/schema";

const OWNER_NAME = "Propietario local";

/* ----------------------------- Workspace ----------------------------- */

export const getWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  const { orm } = await getDb();
  const experts = orm.select().from(schema.experts).orderBy(schema.experts.createdAt).all();
  const processes = orm.select().from(schema.processes).orderBy(schema.processes.id).all();
  const integrations = orm
    .select()
    .from(schema.integrations)
    .orderBy(schema.integrations.name)
    .all();
  const act = orm.select().from(schema.activity).orderBy(desc(schema.activity.ts)).limit(300).all();
  const invoices = orm.select().from(schema.invoices).all();
  const campaigns = orm.select().from(schema.campaigns).all();

  return {
    me: {
      name: OWNER_NAME,
      role: "ADMIN" as const,
    },
    experts: experts.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      sources: e.sources,
      created_at: e.createdAt,
    })),
    processes: processes.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      trigger: p.trigger,
      stages: p.stages,
      limits: p.limits,
      approval: p.approval,
      expert_id: p.expertId,
      active: p.active,
      runs: p.runs,
      last_run: p.lastRun,
    })),
    integrations: integrations.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      connected: i.connected,
      entities: i.entities,
      last_sync: i.lastSync,
    })),
    activity: act.map((a) => ({
      id: a.id,
      ts: a.ts,
      actor: a.actor,
      actor_name: a.actorName,
      type: a.type,
      expert_id: a.expertId,
      status: a.status,
      summary: a.summary,
      sources: a.sources,
      duration_ms: a.durationMs,
      hasSnapshot: !!(a.snapshot as { entries?: unknown[] } | null)?.entries?.length,
      pending: (a.snapshot as { pending?: unknown } | null)?.pending ?? null,
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      client: i.client,
      amount: i.amount,
      status: i.status,
      reminders: i.reminders,
    })),
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status })),
  };
});

export type WorkspaceData = Awaited<ReturnType<typeof getWorkspace>>;

/* ------------------------------ Experts ------------------------------ */

export const createExpert = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        name: z.string().trim().min(1).max(60),
        description: z.string().max(400),
        sources: z.array(z.string()).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    const id =
      data.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      Math.random().toString(36).slice(2, 5);
    orm
      .insert(schema.experts)
      .values({
        id,
        name: data.name,
        description: data.description,
        sources: data.sources,
        createdAt: now(),
      })
      .run();
    await persist();
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Configuración",
      expert_id: id,
      status: "ok",
      summary: `Creado Experto "${data.name}"`,
      snapshot: { entries: [{ table: "experts", pk: { id }, before: null }] },
    });
    return { id };
  });

/* ----------------------------- Processes ----------------------------- */

export const toggleProcess = createServerFn({ method: "POST" })
  .validator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    const p = orm.select().from(schema.processes).where(eq(schema.processes.id, data.id)).all()[0];
    ee.assert(p, "No existe");
    // Snapshot the full row so reverting only flips `active` and never drops
    // the rest of the process metadata.
    const snap = ee.snapshotRows(
      "processes",
      ["id"],
      await ee.fetchRows("processes", "id", [p.id]),
    );
    orm
      .update(schema.processes)
      .set({ active: !p.active })
      .where(eq(schema.processes.id, data.id))
      .run();
    await persist();
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Configuración",
      expert_id: p.expertId,
      status: "ok",
      summary: `${p.active ? "Desactivado" : "Activado"} proceso ${p.name}`,
      snapshot: { entries: snap },
    });
  });

export const runProcess = createServerFn({ method: "POST" })
  .validator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    const p = orm.select().from(schema.processes).where(eq(schema.processes.id, data.id)).all()[0];
    ee.assert(p && p.active, "Proceso no disponible");
    if (p.approval !== "Ninguna") {
      await ee.logActivity({
        actor: "agent",
        actor_name: `Proc · ${p.name}`,
        type: "Ejecución de proceso",
        expert_id: p.expertId,
        status: "pending",
        summary: `Ejecución solicitada — requiere aprobación (${p.approval})`,
        snapshot: { pending: { kind: "run_process", ids: [data.id] } },
      });
      return { pending: true };
    }
    const r = await ee.executePending({ kind: "run_process", ids: [data.id] });
    await ee.logActivity({
      actor: "agent",
      actor_name: `Proc · ${p.name}`,
      type: "Ejecución de proceso",
      expert_id: p.expertId,
      status: "ok",
      summary: r.summary,
      duration_ms: 3000,
      snapshot: { entries: r.snapshot },
    });
    return { pending: false };
  });

/* --------------------------- Approvals ------------------------------ */

export const decideAction = createServerFn({ method: "POST" })
  .validator((d) => z.object({ eventId: z.string(), approve: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    const ev = orm
      .select()
      .from(schema.activity)
      .where(eq(schema.activity.id, data.eventId))
      .all()[0];
    ee.assert(ev && ev.status === "pending", "La acción ya fue resuelta");
    const parsedPending = ee.pendingActionSchema.safeParse(
      (ev.snapshot as { pending?: unknown } | null)?.pending,
    );
    ee.assert(parsedPending.success, "Acción pendiente no válida");
    const pending = parsedPending.data;
    if (!data.approve) {
      orm
        .update(schema.activity)
        .set({ status: "failed", summary: `${ev.summary} — rechazado` })
        .where(eq(schema.activity.id, ev.id))
        .run();
      await persist();
      return { status: "failed" };
    }
    const r = await ee.executePending(pending);
    orm
      .update(schema.activity)
      .set({
        status: "ok",
        summary: `${r.summary} · aprobado`,
        sources: r.sources,
        snapshot: { entries: r.snapshot, pending } as never,
      })
      .where(eq(schema.activity.id, ev.id))
      .run();
    await persist();
    return { status: "ok" };
  });

export const revertEvent = createServerFn({ method: "POST" })
  .validator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    const ev = orm.select().from(schema.activity).where(eq(schema.activity.id, data.id)).all()[0];
    const entries = (ev?.snapshot as { entries?: ee.SnapEntry[] } | null)?.entries;
    ee.assert(ev && entries?.length && ev.status === "ok", "Este evento no se puede revertir");
    await ee.revertSnapshot(entries!);
    orm
      .update(schema.activity)
      .set({ status: "reverted" })
      .where(eq(schema.activity.id, ev!.id))
      .run();
    await persist();
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Reversión",
      expert_id: ev!.expertId,
      status: "ok",
      summary: `Revertido ${ev!.id}: ${ev!.summary}`,
      sources: ["Snapshot"],
      duration_ms: 320,
    });
  });

/* ------------------------------- Chat ------------------------------- */

export const clearChat = createServerFn({ method: "POST" })
  .validator((d) => z.object({ expertId: z.string(), conversationId: z.string().max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    orm
      .delete(schema.chatMessages)
      .where(
        and(
          eq(schema.chatMessages.expertId, data.expertId),
          eq(schema.chatMessages.conversationId, data.conversationId),
        ),
      )
      .run();
    await persist();
  });

export const getChat = createServerFn({ method: "GET" })
  .validator((d) => z.object({ expertId: z.string(), conversationId: z.string().max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    const rows = orm
      .select()
      .from(schema.chatMessages)
      .where(
        and(
          eq(schema.chatMessages.expertId, data.expertId),
          eq(schema.chatMessages.conversationId, data.conversationId),
        ),
      )
      .orderBy(schema.chatMessages.createdAt)
      .all();
    return JSON.stringify(rows.map((r) => r.message));
  });

export const listConversations = createServerFn({ method: "GET" })
  .validator((d) => z.object({ expertId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    const rows = orm
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.expertId, data.expertId))
      .orderBy(schema.chatMessages.createdAt)
      .all();
    const map = new Map<string, { id: string; title: string; updatedAt: string; count: number }>();
    for (const r of rows) {
      const m = r.message as { role?: string; parts?: { type: string; text?: string }[] };
      const cur = map.get(r.conversationId) ?? {
        id: r.conversationId,
        title: "",
        updatedAt: r.createdAt,
        count: 0,
      };
      if (!cur.title && m.role === "user") {
        cur.title = (m.parts ?? [])
          .map((p) => (p.type === "text" ? (p.text ?? "") : ""))
          .join("")
          .slice(0, 80);
      }
      cur.updatedAt = r.createdAt;
      cur.count++;
      map.set(r.conversationId, cur);
    }
    const retentionMs = chatSettings().retentionDays * 24 * 3600 * 1000;
    const cutoff = Date.now() - retentionMs;
    const expired = [...map.values()]
      .filter((c) => new Date(c.updatedAt).getTime() < cutoff)
      .map((c) => c.id);
    if (expired.length) {
      for (const id of expired)
        orm
          .delete(schema.chatMessages)
          .where(
            and(
              eq(schema.chatMessages.expertId, data.expertId),
              eq(schema.chatMessages.conversationId, id),
            ),
          )
          .run();
      await persist();
    }
    return [...map.values()]
      .filter((c) => !expired.includes(c.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });

/* --------------------------- Google Drive --------------------------- */

export const getDriveStatus = createServerFn({ method: "GET" }).handler(async () => {
  const tokens: typeof import("./drive-tokens.server") = await import("./drive-tokens.server");
  return { ...(await tokens.driveConnection()), configured: tokens.googleConfigured() };
});

export const startDriveAuth = createServerFn({ method: "POST" }).handler(async () => {
  const tokens: typeof import("./drive-tokens.server") = await import("./drive-tokens.server");
  if (!tokens.googleConfigured())
    throw new Error("Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.");
  const origin =
    process.env["PUBLIC_APP_URL"]?.replace(/\/$/, "") ||
    (await getRequestHeaders()).get("origin") ||
    "http://localhost:3000";
  return { url: tokens.authorizationUrl(origin, tokens.signState()) };
});

export const disconnectDrive = createServerFn({ method: "POST" }).handler(async () => {
  const tokens: typeof import("./drive-tokens.server") = await import("./drive-tokens.server");
  await tokens.disconnectDrive();
  const { orm } = await getDb();
  orm
    .update(schema.integrations)
    .set({ connected: false, entities: [] })
    .where(eq(schema.integrations.id, "gdrive"))
    .run();
  await persist();
});

export const syncIntegration = createServerFn({ method: "POST" })
  .validator((d) => z.object({ id: z.literal("gdrive") }).parse(d))
  .handler(async () => {
    const drive = await import("./drive.server");
    const tokens: typeof import("./drive-tokens.server") = await import("./drive-tokens.server");
    const conn = await tokens.driveConnection();
    ee.assert(conn.connected, "Primero conecta tu cuenta de Google en Fuentes.");
    const entities = await drive.stats();
    const { orm } = await getDb();
    orm
      .update(schema.integrations)
      .set({ connected: true, lastSync: now(), entities })
      .where(eq(schema.integrations.id, "gdrive"))
      .run();
    await persist();
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Integración",
      expert_id: "general",
      status: "ok",
      summary: `Sincronizado Google Drive (${entities.reduce((a, e) => a + e.count, 0)} archivos)`,
      sources: ["Google Drive"],
    });
  });
