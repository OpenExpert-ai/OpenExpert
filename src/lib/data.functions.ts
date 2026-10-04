// SPDX-License-Identifier: MIT
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isLocalMode } from "@/lib/opencore/mode";

const local = () => import("@/lib/opencore/local-workspace.server");
const authed = () => createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]);
const ACCESS = z.enum(["none", "read", "exec"]);
const ROLE = z.enum(["ADMIN", "INTERMEDIO", "LECTOR"]);

async function cloudWorkspace(userId: string) {
  const ee: typeof import("./ee.server") = await import("./ee.server");
  await ee.getCtx(userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin;
  const [expertsQ, prof, roles, acc, integ, procs, act, inv, invoices, campaigns] =
    await Promise.all([
      db.from("experts").select("*").order("created_at"),
      db.from("profiles").select("*").order("created_at"),
      db.from("user_roles").select("*"),
      db.from("expert_access").select("*"),
      db.from("integrations").select("*").order("name"),
      db.from("processes").select("*").order("id"),
      db.from("activity").select("*").order("ts", { ascending: false }).limit(300),
      db.from("invitations").select("*").order("created_at", { ascending: false }),
      db.from("invoices").select("id, client, amount, status, reminders"),
      db.from("campaigns").select("id, name, status"),
    ]);
  const users = (prof.data ?? []).map((p) => ({
    ...p,
    role: (roles.data?.find((r) => r.user_id === p.id)?.role ?? "LECTOR") as z.infer<typeof ROLE>,
    access: Object.fromEntries(
      (acc.data ?? []).filter((a) => a.user_id === p.id).map((a) => [a.expert_id, a.access]),
    ) as Record<string, z.infer<typeof ACCESS>>,
  }));
  return {
    meId: userId,
    experts: expertsQ.data ?? [],
    users,
    integrations: integ.data ?? [],
    processes: procs.data ?? [],
    activity: (act.data ?? []).map((a) => ({
      ...a,
      hasSnapshot: !!(a.snapshot as { entries?: unknown[] } | null)?.entries?.length,
      pending: (a.snapshot as { pending?: unknown } | null)?.pending ?? null,
      snapshot: undefined,
    })),
    invitations: inv.data ?? [],
    invoices: invoices.data ?? [],
    campaigns: campaigns.data ?? [],
  };
}

export type WorkspaceData = Awaited<ReturnType<typeof cloudWorkspace>>;

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (isLocalMode()) return (await local()).localWorkspace() as unknown as WorkspaceData;
    return cloudWorkspace(context.userId);
  });

export const createExpert = authed()
  .inputValidator((d) =>
    z
      .object({
        name: z.string().trim().min(1).max(60),
        description: z.string().max(400),
        sources: z.array(z.string()).max(20),
        perms: z.record(z.string(), ACCESS),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (isLocalMode())
      return {
        id: (await local()).localCreateExpert({
          name: data.name,
          description: data.description,
          sources: data.sources,
        }),
      };
    const ee: typeof import("./ee.server") = await import("./ee.server");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const c = await ee.getCtx(context.userId);
    ee.assert(c.role === "ADMIN", "Solo los ADMIN pueden crear Experts");
    const id =
      data.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      Math.random().toString(36).slice(2, 5);
    const { error } = await db
      .from("experts")
      .insert({ id, name: data.name, description: data.description, sources: data.sources });
    if (error) throw new Error(error.message);
    const { data: users } = await db.from("user_roles").select("user_id, role");
    const rows = (users ?? []).map((u) => ({
      user_id: u.user_id,
      expert_id: id,
      access:
        u.role === "ADMIN"
          ? "exec"
          : (data.perms[u.user_id] ?? "none") === "exec" && u.role === "LECTOR"
            ? "read"
            : (data.perms[u.user_id] ?? "none"),
    }));
    await db.from("expert_access").insert(rows);
    await ee.logActivity({
      actor: "human",
      actor_name: c.name,
      type: "Configuración",
      expert_id: id,
      status: "ok",
      summary: `Creado Experto "${data.name}"`,
      snapshot: { entries: [{ table: "experts", pk: { id }, before: null }] },
    });
    return { id };
  });

export const setRole = authed()
  .inputValidator((d) => z.object({ userId: z.string().uuid(), role: ROLE }).parse(d))
  .handler(async ({ data, context }) => {
    if (isLocalMode()) return;
    const ee: typeof import("./ee.server") = await import("./ee.server");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const c = await ee.getCtx(context.userId);
    ee.assert(c.role === "ADMIN", "Solo ADMIN");
    if (data.userId === context.userId && data.role !== "ADMIN") {
      const { count } = await db
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "ADMIN");
      ee.assert((count ?? 0) > 1, "Debe quedar al menos un ADMIN");
    }
    const roleRows = await ee.fetchRows("user_roles", "user_id", [data.userId]);
    const accRows = await ee.fetchRows("expert_access", "user_id", [data.userId]);
    const snap = [
      ...(await ee.snapshotRows("user_roles", ["user_id"], roleRows)),
      ...(await ee.snapshotRows("expert_access", ["user_id", "expert_id"], accRows)),
    ];
    await db.from("user_roles").update({ role: data.role }).eq("user_id", data.userId);
    if (data.role === "LECTOR")
      await db
        .from("expert_access")
        .update({ access: "read" })
        .eq("user_id", data.userId)
        .eq("access", "exec");
    if (data.role === "ADMIN")
      await db.from("expert_access").update({ access: "exec" }).eq("user_id", data.userId);
    const { data: p } = await db.from("profiles").select("name").eq("id", data.userId).single();
    await ee.logActivity({
      actor: "human",
      actor_name: c.name,
      type: "Cambio de rol",
      expert_id: "general",
      status: "ok",
      summary: `${p?.name}: ${roleRows[0]?.role} → ${data.role}`,
      snapshot: { entries: snap },
    });
  });

export const setAccess = authed()
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), expertId: z.string(), access: ACCESS }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (isLocalMode()) return;
    const ee: typeof import("./ee.server") = await import("./ee.server");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const c = await ee.getCtx(context.userId);
    ee.assert(c.role === "ADMIN", "Solo ADMIN");
    const { data: r } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId)
      .single();
    ee.assert(
      !(r?.role === "LECTOR" && data.access === "exec"),
      "Un LECTOR no puede tener permisos de ejecución",
    );
    const { data: before } = await db
      .from("expert_access")
      .select("*")
      .eq("user_id", data.userId)
      .eq("expert_id", data.expertId)
      .maybeSingle();
    await db
      .from("expert_access")
      .upsert({ user_id: data.userId, expert_id: data.expertId, access: data.access });
    const { data: p } = await db.from("profiles").select("name").eq("id", data.userId).single();
    await ee.logActivity({
      actor: "human",
      actor_name: c.name,
      type: "Permisos",
      expert_id: data.expertId,
      status: "ok",
      summary: `${p?.name} en ${data.expertId}: ${before?.access ?? "none"} → ${data.access}`,
      snapshot: {
        entries: [
          {
            table: "expert_access",
            pk: { user_id: data.userId, expert_id: data.expertId },
            before: before ?? null,
          },
        ],
      },
    });
  });

export const inviteUser = authed()
  .inputValidator((d) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        name: z.string().trim().min(1).max(100),
        title: z.string().max(100),
        role: ROLE,
        expertId: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (isLocalMode()) return;
    const ee: typeof import("./ee.server") = await import("./ee.server");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const c = await ee.getCtx(context.userId);
    ee.assert(c.role === "ADMIN", "Solo ADMIN");
    const email = data.email.toLowerCase();
    const { error } = await db.from("invitations").upsert({
      email,
      name: data.name,
      title: data.title || "Invitado",
      role: data.role,
      expert_id: data.expertId,
    });
    if (error) throw new Error(error.message);
    await ee.logActivity({
      actor: "human",
      actor_name: c.name,
      type: "Invitación",
      expert_id: data.expertId,
      status: "ok",
      summary: `Invitado ${email} como ${data.role}`,
      snapshot: { entries: [{ table: "invitations", pk: { email }, before: null }] },
    });
  });

export const toggleIntegration = authed()
  .inputValidator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    if (isLocalMode()) return;
    const ee: typeof import("./ee.server") = await import("./ee.server");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const c = await ee.getCtx(context.userId);
    ee.assert(c.role === "ADMIN", "Solo ADMIN");
    const rows = await ee.fetchRows("integrations", "id", [data.id]);
    const i = rows[0];
    ee.assert(i, "No existe");
    ee.assert(data.id === "gdrive", `${i.name} aún no tiene una conexión real configurada`);
    const t0 = Date.now();
    let entities: { name: string; count: number }[] = [];
    if (!i.connected) {
      const drive = await import("./drive.server");
      const tokens = await import("./drive-tokens.server");
      ee.assert(
        (await tokens.driveConnection(context.userId)).connected,
        "Primero conecta tu cuenta de Google en Fuentes.",
      );
      entities = await drive.stats(context.userId);
    }
    await db
      .from("integrations")
      .update({ connected: !i.connected, last_sync: new Date().toISOString(), entities })
      .eq("id", data.id);
    await ee.logActivity({
      actor: "human",
      actor_name: c.name,
      type: "Integración",
      expert_id: "general",
      status: "ok",
      summary: `${i.connected ? "Desconectado" : "Conectado"} ${i.name}`,
      sources: [i.name as string],
      duration_ms: Date.now() - t0,
      snapshot: { entries: await ee.snapshotRows("integrations", ["id"], rows) },
    });
  });

export const syncIntegration = authed()
  .inputValidator((d) => z.object({ id: z.literal("gdrive") }).parse(d))
  .handler(async ({ context }) => {
    if (isLocalMode()) return;
    const ee: typeof import("./ee.server") = await import("./ee.server");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const c = await ee.getCtx(context.userId);
    ee.assert(c.role !== "LECTOR", "Sin permiso para sincronizar");
    const t0 = Date.now();
    const drive = await import("./drive.server");
    const entities = await drive.stats(context.userId);
    await db
      .from("integrations")
      .update({ connected: true, last_sync: new Date().toISOString(), entities })
      .eq("id", "gdrive");
    await ee.logActivity({
      actor: "human",
      actor_name: c.name,
      type: "Integración",
      expert_id: "general",
      status: "ok",
      summary: `Sincronizado Google Drive (${entities.reduce((a, e) => a + e.count, 0)} archivos)`,
      sources: ["Google Drive"],
      duration_ms: Date.now() - t0,
    });
  });

export const toggleProcess = authed()
  .inputValidator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    if (isLocalMode()) {
      (await local()).localToggleProcess(data.id);
      return;
    }
    const ee: typeof import("./ee.server") = await import("./ee.server");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const c = await ee.getCtx(context.userId);
    ee.assert(c.role === "ADMIN", "Solo ADMIN");
    const rows = await ee.fetchRows("processes", "id", [data.id]);
    const p = rows[0];
    ee.assert(p, "No existe");
    await db.from("processes").update({ active: !p.active }).eq("id", data.id);
    await ee.logActivity({
      actor: "human",
      actor_name: c.name,
      type: "Configuración",
      expert_id: p.expert_id as string,
      status: "ok",
      summary: `${p.active ? "Desactivado" : "Activado"} proceso ${p.name}`,
      snapshot: { entries: await ee.snapshotRows("processes", ["id"], rows) },
    });
  });

export const runProcess = authed()
  .inputValidator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    if (isLocalMode()) return { pending: false };
    const ee: typeof import("./ee.server") = await import("./ee.server");
    const c = await ee.getCtx(context.userId);
    const p = (await ee.fetchRows("processes", "id", [data.id]))[0];
    ee.assert(p && p.active, "Proceso no disponible");
    ee.assert(ee.canExec(c, p.expert_id as string), "Sin permiso de ejecución en este Experto");
    if (p.approval !== "Ninguna") {
      await ee.logActivity({
        actor: "agent",
        actor_name: `Proc · ${p.name}`,
        type: "Ejecución de proceso",
        expert_id: p.expert_id as string,
        status: "pending",
        summary: `Ejecución solicitada por ${c.name} — requiere aprobación (${p.approval})`,
        snapshot: { pending: { kind: "run_process", ids: [data.id] }, requestedBy: context.userId },
      });
      return { pending: true };
    }
    const r = await ee.executePending({ kind: "run_process", ids: [data.id] });
    await ee.logActivity({
      actor: "agent",
      actor_name: `Proc · ${p.name}`,
      type: "Ejecución de proceso",
      expert_id: p.expert_id as string,
      status: "ok",
      summary: `${r.summary} (lanzado por ${c.name})`,
      duration_ms: 3000 + Math.round(Math.random() * 20000),
      snapshot: { entries: r.snapshot },
    });
    return { pending: false };
  });

export const decideAction = authed()
  .inputValidator((d) => z.object({ eventId: z.string(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    if (isLocalMode()) return { status: data.approve ? "ok" : "failed" };
    const ee: typeof import("./ee.server") = await import("./ee.server");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const c = await ee.getCtx(context.userId);
    const { data: ev } = await db.from("activity").select("*").eq("id", data.eventId).single();
    ee.assert(ev && ev.status === "pending", "La acción ya fue resuelta");
    const snap = ev.snapshot as {
      pending: import("./ee.server").PendingAction;
      requestedBy?: string;
      approvals?: string[];
    };
    ee.assert(
      ev.expert_id && ee.canExec(c, ev.expert_id),
      "Sin permiso para aprobar en este Experto",
    );
    if (!data.approve) {
      await db
        .from("activity")
        .update({ status: "failed", summary: `${ev.summary} — rechazado por ${c.name}` })
        .eq("id", ev.id);
      return { status: "failed" };
    }
    if (snap.pending.kind === "run_process") {
      const p = (await ee.fetchRows("processes", "id", snap.pending.ids))[0];
      if (p?.approval === "Doble firma") {
        const approvals = [...new Set([...(snap.approvals ?? []), context.userId])];
        if (approvals.length < 2) {
          await db
            .from("activity")
            .update({
              snapshot: { ...snap, approvals } as never,
              summary: `${ev.summary} — 1/2 firmas (${c.name})`,
            })
            .eq("id", ev.id);
          return { status: "pending" };
        }
      }
    }
    const r = await ee.executePending(snap.pending);
    await db
      .from("activity")
      .update({
        status: "ok",
        summary: `${r.summary} · aprobado por ${c.name}`,
        sources: r.sources,
        snapshot: { entries: r.snapshot, pending: snap.pending } as never,
      })
      .eq("id", ev.id);
    return { status: "ok" };
  });

export const revertEvent = authed()
  .inputValidator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    if (isLocalMode()) return;
    const ee: typeof import("./ee.server") = await import("./ee.server");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const c = await ee.getCtx(context.userId);
    ee.assert(c.role === "ADMIN", "Solo los ADMIN pueden revertir");
    const { data: ev } = await db.from("activity").select("*").eq("id", data.id).single();
    const entries = (ev?.snapshot as { entries?: import("./ee.server").SnapEntry[] } | null)
      ?.entries;
    ee.assert(ev && entries?.length && ev.status === "ok", "Este evento no se puede revertir");
    await ee.revertSnapshot(entries);
    await db.from("activity").update({ status: "reverted" }).eq("id", ev.id);
    await ee.logActivity({
      actor: "human",
      actor_name: c.name,
      type: "Reversión",
      expert_id: ev.expert_id ?? "general",
      status: "ok",
      summary: `Revertido ${ev.id}: ${ev.summary}`,
      sources: ["Snapshot"],
      duration_ms: 320,
    });
  });

export const clearChat = authed()
  .inputValidator((d) =>
    z.object({ expertId: z.string(), conversationId: z.string().max(64) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (isLocalMode()) {
      (await local()).localClearChat(data.expertId, data.conversationId);
      return;
    }
    await context.supabase
      .from("chat_messages")
      .delete()
      .eq("user_id", context.userId)
      .eq("expert_id", data.expertId)
      .eq("conversation_id", data.conversationId);
  });

export const getChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ expertId: z.string(), conversationId: z.string().max(64) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (isLocalMode()) return (await local()).localChat(data.expertId, data.conversationId);
    const { data: rows, error } = await context.supabase
      .from("chat_messages")
      .select("message")
      .eq("user_id", context.userId)
      .eq("expert_id", data.expertId)
      .eq("conversation_id", data.conversationId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return JSON.stringify((rows ?? []).map((r) => r.message));
  });

const RETENTION_MS = 30 * 24 * 3600 * 1000;

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ expertId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    if (isLocalMode()) return (await local()).localConversations(data.expertId);
    const { data: rows, error } = await context.supabase
      .from("chat_messages")
      .select("conversation_id, created_at, message")
      .eq("user_id", context.userId)
      .eq("expert_id", data.expertId)
      .order("created_at");
    if (error) throw new Error(error.message);
    const map = new Map<string, { id: string; title: string; updatedAt: string; count: number }>();
    for (const r of rows ?? []) {
      const m = r.message as { role?: string; parts?: { type: string; text?: string }[] };
      const cur = map.get(r.conversation_id) ?? {
        id: r.conversation_id,
        title: "",
        updatedAt: r.created_at,
        count: 0,
      };
      if (!cur.title && m.role === "user")
        cur.title = (m.parts ?? [])
          .map((p) => (p.type === "text" ? (p.text ?? "") : ""))
          .join("")
          .slice(0, 80);
      cur.updatedAt = r.created_at;
      cur.count++;
      map.set(r.conversation_id, cur);
    }
    const cutoff = Date.now() - RETENTION_MS;
    const expired = [...map.values()]
      .filter((c) => new Date(c.updatedAt).getTime() < cutoff)
      .map((c) => c.id);
    if (expired.length)
      await context.supabase
        .from("chat_messages")
        .delete()
        .eq("user_id", context.userId)
        .eq("expert_id", data.expertId)
        .in("conversation_id", expired);
    return [...map.values()]
      .filter((c) => !expired.includes(c.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });

// --- Google Drive: per-user OAuth connection -------------------------------

export const getDriveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tokens: typeof import("./drive-tokens.server") = await import("./drive-tokens.server");
    return {
      ...(await tokens.driveConnection(context.userId)),
      configured: tokens.googleConfigured(),
    };
  });

/** Returns the Google consent URL; the client does a full-page redirect to it. */
export const startDriveAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tokens: typeof import("./drive-tokens.server") = await import("./drive-tokens.server");
    if (!tokens.googleConfigured())
      throw new Error("Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.");
    const origin =
      process.env["PUBLIC_APP_URL"]?.replace(/\/$/, "") ||
      (await getRequestHeaders()).get("origin") ||
      "http://localhost:3000";
    return { url: tokens.authorizationUrl(origin, await tokens.signState(context.userId)) };
  });

export const disconnectDrive = authed().handler(async ({ context }) => {
  if (isLocalMode()) {
    const tokens: typeof import("./drive-tokens.server") = await import("./drive-tokens.server");
    await tokens.disconnectDrive(context.userId);
    return;
  }
  const ee: typeof import("./ee.server") = await import("./ee.server");
  const tokens: typeof import("./drive-tokens.server") = await import("./drive-tokens.server");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const c = await ee.getCtx(context.userId);
  ee.assert(c.role === "ADMIN", "Solo los ADMIN pueden desconectar integraciones globales");
  await tokens.disconnectDrive(context.userId);
  await db.from("integrations").update({ connected: false, entities: [] }).eq("id", "gdrive");
  await ee.logActivity({
    actor: "human",
    actor_name: c.name,
    type: "Integración",
    expert_id: "general",
    status: "ok",
    summary: "Desconectado Google Drive",
    sources: ["Google Drive"],
  });
});
