// SPDX-License-Identifier: MIT
// Server functions: the single write path and the workspace read model.
// Local SQLite, single owner (no auth, no RBAC).

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as ee from "./ee.server";
import { EXPERT_DOMAINS } from "./domains";
import { collectModelReplies, firstInjection, type GateMessage } from "@/lib/ai/injection";
import { settleHistory } from "@/lib/ai/approval-history";
import { chatSettings } from "@/lib/config.server";
import type { DriveGrant } from "@/lib/engine/local-secrets.server";
import { getDb, now, persist, type Db } from "@/lib/db.server";
import * as schema from "../../drizzle/schema";

const OWNER_NAME = "Propietario local";

/* ----------------------------- Workspace ----------------------------- */

// The panel is where events get reverted, so the audit log has to be readable
// to the end. The workspace used to `limit(300)` in silence and the page
// printed that length as the total: a log with more than 300 entries claimed
// to be complete, and the snapshot of anything older —the event you would want
// to revert— could not be reached at all. The window keeps its size (the whole
// log does not fit in one payload) but now travels with the real total, and
// `getActivityPage` walks past it.
const ACTIVITY_WINDOW = 300;
const ACTIVITY_PAGE_MAX = 300;

type ActivityRecord = typeof schema.activity.$inferSelect;

function toActivityEvent(a: ActivityRecord) {
  return {
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
  };
}

function countActivity(orm: Db): number {
  return orm.select({ n: count() }).from(schema.activity).all()[0]?.n ?? 0;
}

// Newest first, with `id` breaking ties: two events written in the same
// millisecond otherwise swap places between pages, so one row shows twice and
// another never shows at all.
function readActivity(orm: Db, offset: number, limit: number): ActivityRecord[] {
  return orm
    .select()
    .from(schema.activity)
    .orderBy(desc(schema.activity.ts), desc(schema.activity.id))
    .limit(limit)
    .offset(offset)
    .all();
}

export const getWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  const { orm } = await getDb();
  const experts = orm.select().from(schema.experts).orderBy(schema.experts.createdAt).all();
  const integrations = orm
    .select()
    .from(schema.integrations)
    .orderBy(schema.integrations.name)
    .all();
  const act = readActivity(orm, 0, ACTIVITY_WINDOW);
  const activityTotal = countActivity(orm);
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
      domains: e.domains,
      created_at: e.createdAt,
    })),
    integrations: integrations.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      connected: i.connected,
      entities: i.entities,
      last_sync: i.lastSync,
    })),
    activity: act.map(toActivityEvent),
    // COUNT(*) and not `activity.length`: the page has to say how many events
    // exist, not how many fit in the window.
    activityTotal,
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

/**
 * One page of the audit log, older than the workspace window. The page has to
 * reach the oldest event —the revert buttons live on these rows— so it takes an
 * offset instead of stopping at the first 300.
 */
export const getActivityPage = createServerFn({ method: "GET" })
  .validator((d) =>
    z
      .object({
        offset: z.number().int().min(0).max(1_000_000).default(0),
        limit: z.number().int().min(1).max(ACTIVITY_PAGE_MAX).default(ACTIVITY_PAGE_MAX),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    const rows = readActivity(orm, data.offset, data.limit);
    const total = countActivity(orm);
    return {
      activity: rows.map(toActivityEvent),
      total,
      offset: data.offset,
      // Where the next page starts. Repeating the offset would rewrite the same
      // rows forever when the request lands past the end of the log.
      next_offset: data.offset + rows.length,
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
        domains: z.array(z.enum(EXPERT_DOMAINS)).max(EXPERT_DOMAINS.length).default([]),
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
        domains: data.domains,
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

export const updateExpert = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        id: z.string().min(1).max(80),
        name: z.string().trim().min(1).max(60),
        description: z.string().max(400),
        sources: z.array(z.string()).max(20),
        domains: z.array(z.enum(EXPERT_DOMAINS)).max(EXPERT_DOMAINS.length),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    const rows = await ee.fetchRows("experts", "id", [data.id]);
    ee.assert(rows[0], "Experto no encontrado");
    orm
      .update(schema.experts)
      .set({
        name: data.name,
        description: data.description,
        sources: data.sources,
        domains: data.domains,
      })
      .where(eq(schema.experts.id, data.id))
      .run();
    await persist();
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Configuración",
      expert_id: data.id,
      status: "ok",
      summary: `Editado Experto "${data.name}"`,
      snapshot: { entries: ee.snapshotRows("experts", ["id"], rows) },
    });
    return { id: data.id };
  });

export const deleteExpert = createServerFn({ method: "POST" })
  .validator((d) => z.object({ id: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    ee.assert(data.id !== "general", "El Experto General no se puede eliminar");
    const { orm } = await getDb();
    const rows = await ee.fetchRows("experts", "id", [data.id]);
    const before = rows[0];
    ee.assert(before, "Experto no encontrado");
    // Drop the Expert and its conversations. The Expert row is snapshot-backed
    // (revertible); the conversations are permanent, like clearing a chat.
    orm.delete(schema.experts).where(eq(schema.experts.id, data.id)).run();
    orm.delete(schema.chatMessages).where(eq(schema.chatMessages.expertId, data.id)).run();
    await persist();
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Configuración",
      expert_id: data.id,
      status: "ok",
      summary: `Eliminado Experto "${String(before["name"])}"`,
      snapshot: { entries: ee.snapshotRows("experts", ["id"], rows) },
    });
    return { id: data.id };
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
    // The revert is timed: the audit row carries the time the replay really
    // took, not a constant.
    const startedAt = Date.now();
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
      duration_ms: Date.now() - startedAt,
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
    // A message the chat gate rejects is not replayed. Rows written before the
    // gate read the whole conversation — or by any path that skipped it — would
    // otherwise deny every retry of that conversation with no way out. They stay
    // in the database (the audit event names them) and are simply not sent back
    // to the client, which is also what keeps them away from the model.
    // The replies the model wrote are not attempts, so they are replayed: the
    // base is what says they came from the model.
    const chat = chatSettings();
    const modelReplies = collectModelReplies(rows.map((row) => row.message));
    const replayed = chat.injectionGuard
      ? rows.filter(
          (row) =>
            !firstInjection(
              [row.message as GateMessage],
              chat.injectionExtraPatterns,
              modelReplies,
            ),
        )
      : rows;
    // A message that asked for approval and whose call is already decided in
    // this same conversation is replayed with the stored outcome, not with its
    // buttons alive: an answer saved before this was persisted left both copies
    // in the history, and the pending one came back on every reload ready to
    // run the write a second time.
    const settled = settleHistory(
      replayed.map((r) => r.message as { parts?: unknown }),
      rows.map((r) => r.message),
    );
    return JSON.stringify(settled);
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
    // Retention of zero means "never prune", exactly what the settings screen promises
    // ("0 desactiva la purga automática"). Treating it as "expire everything now" wiped
    // the whole history of the expert the moment the list was opened.
    const retentionDays = chatSettings().retentionDays;
    const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
    const expired =
      retentionDays > 0
        ? [...map.values()].filter((c) => new Date(c.updatedAt).getTime() < cutoff).map((c) => c.id)
        : [];
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
  const local: typeof import("@/lib/engine/local-secrets.server") =
    await import("@/lib/engine/local-secrets.server");
  return {
    ...(await tokens.driveConnection()),
    configured: tokens.googleConfigured(),
    granted: local.loadGrantedFiles(),
  };
});

export const getGrantedFiles = createServerFn({ method: "GET" }).handler(async () => {
  const local: typeof import("@/lib/engine/local-secrets.server") =
    await import("@/lib/engine/local-secrets.server");
  return { files: local.loadGrantedFiles() };
});

export const getDriveConsent = createServerFn({ method: "GET" }).handler(async () => {
  const local: typeof import("@/lib/engine/local-secrets.server") =
    await import("@/lib/engine/local-secrets.server");
  return { consent: local.loadDriveConsent() };
});

export const acceptDriveConsent = createServerFn({ method: "POST" }).handler(async () => {
  const local: typeof import("@/lib/engine/local-secrets.server") =
    await import("@/lib/engine/local-secrets.server");
  const privacyUrl =
    process.env["OPENEXPERT_PRIVACY_URL"]?.trim() ||
    "https://github.com/OpenExpert-ai/OpenExpert/blob/main/PRIVACY.md";
  const c = { at: new Date().toISOString(), privacyUrl };
  local.saveDriveConsent(c);
  return { ok: true, ...c };
});

/** Writes the granted set and mirrors it in the `gdrive` integration row. */
async function saveGrantedFiles(next: DriveGrant[], now: string): Promise<void> {
  const local: typeof import("@/lib/engine/local-secrets.server") =
    await import("@/lib/engine/local-secrets.server");
  local.saveGrantedFiles(next);
  const { orm } = await getDb();
  orm
    .update(schema.integrations)
    .set({ connected: true, entities: summarizeGrants(next), lastSync: now })
    .where(eq(schema.integrations.id, "gdrive"))
    .run();
  await persist();
}

const grantSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  mimeType: z.string(),
});

/** Adds the files picked in Google Picker to the granted set (never replaces it). */
export const addGrantedFiles = createServerFn({ method: "POST" })
  .validator((d) => z.object({ files: z.array(grantSchema).max(5000) }).parse(d))
  .handler(async ({ data }) => {
    const local: typeof import("@/lib/engine/local-secrets.server") =
      await import("@/lib/engine/local-secrets.server");
    const existing = local.loadGrantedFiles();
    const map = new Map(existing.map((f) => [f.id, f]));
    const now = new Date().toISOString();
    for (const f of data.files) {
      map.set(f.id, { ...f, addedAt: map.get(f.id)?.addedAt ?? now });
    }
    const next = [...map.values()].slice(-5000);
    await saveGrantedFiles(next, now);
    return { ok: true, count: next.length };
  });

/**
 * Revokes the grant for one file. The id disappears from `drive-grants.json`, so
 * `read_drive_file`/`search_drive` stop seeing it (they check the stored ids).
 */
export const revokeGrantedFile = createServerFn({ method: "POST" })
  .validator((d) => z.object({ id: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const local: typeof import("@/lib/engine/local-secrets.server") =
      await import("@/lib/engine/local-secrets.server");
    const existing = local.loadGrantedFiles();
    const target = existing.find((f) => f.id === data.id);
    if (!target) return { ok: true, revoked: false, count: existing.length };
    const next = existing.filter((f) => f.id !== data.id);
    const now = new Date().toISOString();
    await saveGrantedFiles(next, now);
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Integración",
      expert_id: "general",
      status: "ok",
      summary: `Retirado el acceso a «${target.name}» de Google Drive (${ee.countPhrase(next.length, "archivo concedido", "archivos concedidos")})`,
      sources: ["Google Drive"],
    });
    return { ok: true, revoked: true, count: next.length };
  });

function summarizeGrants(files: { mimeType: string }[]) {
  const counts: Record<string, number> = {};
  for (const f of files) {
    const kind = KIND_GRANT[f.mimeType] ?? "Otros archivos";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

const KIND_GRANT: Record<string, string> = {
  "application/vnd.google-apps.document": "Documentos",
  "application/vnd.google-apps.spreadsheet": "Hojas de cálculo",
  "application/vnd.google-apps.presentation": "Presentaciones",
  "application/vnd.google-apps.folder": "Carpetas",
  "application/pdf": "PDF",
};

export const privacyUrl = createServerFn({ method: "GET" }).handler(async () => ({
  url:
    process.env["OPENEXPERT_PRIVACY_URL"]?.trim() ||
    "https://github.com/OpenExpert-ai/OpenExpert/blob/main/PRIVACY.md",
}));

/**
 * Non-secret client configuration the browser needs (Picker key, project
 * number, OAuth client id). Public identifiers only.
 */
export const getClientConfig = createServerFn({ method: "GET" }).handler(async () => {
  const secrets = await import("@/lib/engine/local-secrets.server").then((m) =>
    m.loadGrantedFiles(),
  );
  void secrets;
  return {
    pickerKey: process.env["GOOGLE_PICKER_API_KEY"]?.trim() || "",
    pickerAppId: process.env["GOOGLE_PICKER_APP_ID"]?.trim() || "",
    googleClientId:
      process.env["OPENEXPERT_GOOGLE_CLIENT_ID"]?.trim() ||
      process.env["GOOGLE_CLIENT_ID"]?.trim() ||
      "",
    privacyUrl:
      process.env["OPENEXPERT_PRIVACY_URL"]?.trim() ||
      "https://github.com/OpenExpert-ai/OpenExpert/blob/main/PRIVACY.md",
  };
});

export const getDriveAccessToken = createServerFn({ method: "GET" }).handler(async () => {
  const tokens: typeof import("./drive-tokens.server") = await import("./drive-tokens.server");
  const access = await tokens.getAccessToken();
  // The browser is trusted in the local single-owner edition (see SECURITY.md).
  return { accessToken: access };
});

export const startDriveAuth = createServerFn({ method: "POST" }).handler(async () => {
  const tokens: typeof import("./drive-tokens.server") = await import("./drive-tokens.server");
  if (!tokens.googleConfigured())
    throw new Error(
      "Falta configurar el cliente OAuth de Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
    );
  const origin =
    process.env["PUBLIC_APP_URL"]?.replace(/\/$/, "") ||
    (await getRequestHeaders()).get("origin") ||
    "http://localhost:3000";
  const { state, verifier } = tokens.signState();
  const codeChallenge = await (async () => {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(verifier).digest("base64url");
  })();
  return { url: tokens.authorizationUrl(origin, state, codeChallenge) };
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
    const local: typeof import("@/lib/engine/local-secrets.server") =
      await import("@/lib/engine/local-secrets.server");
    const tokens: typeof import("./drive-tokens.server") = await import("./drive-tokens.server");
    const conn = await tokens.driveConnection();
    ee.assert(conn.connected, "Primero selecciona archivos de Google Drive en Fuentes.");
    const grants = local.loadGrantedFiles();
    const entities = summarizeGrants(grants);
    const { orm } = await getDb();
    const now = new Date().toISOString();
    orm
      .update(schema.integrations)
      .set({ connected: true, lastSync: now, entities })
      .where(eq(schema.integrations.id, "gdrive"))
      .run();
    await persist();
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Integración",
      expert_id: "general",
      status: "ok",
      summary: `Sincronizado Google Drive (${ee.countPhrase(grants.length, "archivo concedido", "archivos concedidos")})`,
      sources: ["Google Drive"],
    });
  });

/* ---------------------------- Local folders ---------------------------- */

async function setLocalIntegration(roots: { path: string }[]): Promise<void> {
  const { orm } = await getDb();
  orm
    .update(schema.integrations)
    .set({
      connected: roots.length > 0,
      entities: roots.length ? [{ name: "Carpetas", count: roots.length }] : [],
      lastSync: new Date().toISOString(),
    })
    .where(eq(schema.integrations.id, "local"))
    .run();
  await persist();
}

export const getLocalRoots = createServerFn({ method: "GET" }).handler(async () => {
  const local: typeof import("@/lib/engine/local-secrets.server") =
    await import("@/lib/engine/local-secrets.server");
  return { roots: local.loadLocalRoots() };
});

export const browseLocalDir = createServerFn({ method: "GET" })
  .validator((d) => z.object({ path: z.string().max(4096).optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const fs: typeof import("./local-fs.server") = await import("./local-fs.server");
    return fs.browseDirectory(data?.path ?? null);
  });

export const addLocalRoot = createServerFn({ method: "POST" })
  .validator((d) => z.object({ path: z.string().trim().min(1).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const fs: typeof import("./local-fs.server") = await import("./local-fs.server");
    const local: typeof import("@/lib/engine/local-secrets.server") =
      await import("@/lib/engine/local-secrets.server");
    const info = fs.rootInfo(data.path);
    const roots = local.loadLocalRoots();
    if (!roots.some((r) => r.path === info.path)) {
      roots.push({ ...info, addedAt: new Date().toISOString() });
      local.saveLocalRoots(roots);
    }
    await setLocalIntegration(roots);
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Integración",
      expert_id: "general",
      status: "ok",
      summary: `Añadida carpeta local "${info.name}"`,
      sources: ["Archivos locales"],
    });
    return { roots };
  });

export const removeLocalRoot = createServerFn({ method: "POST" })
  .validator((d) => z.object({ path: z.string().min(1).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const local: typeof import("@/lib/engine/local-secrets.server") =
      await import("@/lib/engine/local-secrets.server");
    const roots = local.loadLocalRoots().filter((r) => r.path !== data.path);
    local.saveLocalRoots(roots);
    await setLocalIntegration(roots);
    await ee.logActivity({
      actor: "human",
      actor_name: OWNER_NAME,
      type: "Integración",
      expert_id: "general",
      status: "ok",
      summary: `Quitada carpeta local ${data.path}`,
      sources: ["Archivos locales"],
    });
    return { roots };
  });

/* ------------------------------- Notion ------------------------------- */

export const getNotionStatus = createServerFn({ method: "GET" }).handler(async () => {
  const notion: typeof import("./notion-tokens.server") = await import("./notion-tokens.server");
  return { ...notion.notionConnection(), configured: notion.notionConfigured() };
});

export const startNotionAuth = createServerFn({ method: "POST" }).handler(async () => {
  const notion: typeof import("./notion-tokens.server") = await import("./notion-tokens.server");
  if (!notion.notionConfigured())
    throw new Error(
      "Falta configurar el cliente OAuth de Notion (NOTION_CLIENT_ID / NOTION_CLIENT_SECRET).",
    );
  const origin =
    process.env["PUBLIC_APP_URL"]?.replace(/\/$/, "") ||
    (await getRequestHeaders()).get("origin") ||
    "http://localhost:3000";
  const { state } = notion.signState();
  return { url: notion.authorizationUrl(origin, state) };
});

export const disconnectNotion = createServerFn({ method: "POST" }).handler(async () => {
  const notion: typeof import("./notion-tokens.server") = await import("./notion-tokens.server");
  notion.disconnectNotion();
  const { orm } = await getDb();
  orm
    .update(schema.integrations)
    .set({ connected: false, entities: [] })
    .where(eq(schema.integrations.id, "notion"))
    .run();
  await persist();
  await ee.logActivity({
    actor: "human",
    actor_name: OWNER_NAME,
    type: "Integración",
    expert_id: "general",
    status: "ok",
    summary: "Desconectado Notion",
    sources: ["Notion"],
  });
});
