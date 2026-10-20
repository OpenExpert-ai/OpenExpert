// SPDX-License-Identifier: MIT
// Server functions are called by the browser as `fn({ data })`; the mock keeps
// that contract (validator → handler) without spinning up an HTTP server, so
// the suite exercises the real zod validators, the real SQLite writes and the
// real revertible snapshots.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ServerFn = ((opts?: { data?: unknown }) => Promise<unknown>) & {
  validator: (validate: (input: unknown) => unknown) => ServerFn;
  handler: (run: (ctx: { data: unknown }) => unknown) => ServerFn;
};

vi.mock("@tanstack/react-start", () => {
  const createServerFn = (): ServerFn => {
    let validate: (input: unknown) => unknown = (input) => input;
    let run: ((ctx: { data: unknown }) => unknown) | undefined;
    const call = (async (opts?: { data?: unknown }) => {
      if (!run) throw new Error("server function without a handler");
      return await run({ data: validate(opts?.data) });
    }) as ServerFn;
    call.validator = (next) => {
      validate = next;
      return call;
    };
    call.handler = (next) => {
      run = next;
      return call;
    };
    return call;
  };
  return { createServerFn };
});

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ origin: "http://localhost:3000" }),
}));

// The retention window lives in openexpert.json; pinning it here is what makes
// the expiry branch of `listConversations` testable without writing config into
// the repository root.
const chatCfg = vi.hoisted(() => ({ retentionDays: 30 }));
vi.mock("@/lib/config.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config.server")>();
  return {
    ...actual,
    chatSettings: () => ({ ...actual.chatSettings(), retentionDays: chatCfg.retentionDays }),
  };
});

let dir: string;
let fns: typeof import("./data.functions");
let db: typeof import("./db.server");
let schema: typeof import("../../drizzle/schema");
let local: typeof import("./engine/local-secrets.server");

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-data-functions-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
  db = await import("./db.server");
  schema = await import("../../drizzle/schema");
  local = await import("./engine/local-secrets.server");
  fns = await import("./data.functions");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

const SECRET_FILES = [
  "credentials.json",
  "drive-grants.json",
  "local-roots.json",
  "notion.json",
  "drive-consent.json",
  "secret.key",
  "state-secret",
  "state-secret-notion",
];

beforeEach(async () => {
  chatCfg.retentionDays = 30;
  for (const file of SECRET_FILES) rmSync(join(dir, file), { force: true });
  db.resetDbHandle();
  rmSync(db.dbPath(), { force: true });
  await db.getDb();
});

afterEach(() => {
  for (const key of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "OPENEXPERT_GOOGLE_CLIENT_ID",
    "NOTION_CLIENT_ID",
    "NOTION_CLIENT_SECRET",
    "OPENEXPERT_NOTION_CLIENT_ID",
    "GOOGLE_PICKER_API_KEY",
    "GOOGLE_PICKER_APP_ID",
    "PUBLIC_APP_URL",
    "OPENEXPERT_PRIVACY_URL",
  ]) {
    delete process.env[key];
  }
});

/* ------------------------------- helpers -------------------------------- */

const expertPayload = (over: Record<string, unknown> = {}) => ({
  name: "Operaciones",
  description: "Coordina el día a día",
  sources: ["gdrive"],
  domains: ["ventas", "clientes"],
  ...over,
});

const activityRows = async () => (await db.getDb()).orm.select().from(schema.activity).all();

const findActivity = async (predicate: (row: { summary: string }) => boolean) => {
  const rows = await activityRows();
  return rows.find((row) => predicate(row as { summary: string }));
};

async function insertChat(
  expertId: string,
  conversationId: string,
  createdAt: string,
  message: unknown,
) {
  const { orm } = await db.getDb();
  orm
    .insert(schema.chatMessages)
    .values({
      id: `msg-${Math.random().toString(36).slice(2)}`,
      expertId,
      conversationId,
      message,
      createdAt,
    })
    .run();
  await db.persist();
}

const userMessage = (text: string) => ({ role: "user", parts: [{ type: "text", text }] });
const assistantMessage = (text: string) => ({
  role: "assistant",
  parts: [{ type: "text", text }],
});

/* ----------------------------- getWorkspace ----------------------------- */

describe("getWorkspace", () => {
  it("devuelve el propietario local, los Expertos sembrados y las integraciones", async () => {
    const ws = (await fns.getWorkspace()) as {
      me: { name: string; role: string };
      experts: { id: string; name: string; domains: string[] }[];
      integrations: { id: string; connected: boolean; entities: unknown[] }[];
      activity: unknown[];
      invoices: unknown[];
      campaigns: unknown[];
    };
    expect(ws.me).toEqual({ name: "Propietario local", role: "ADMIN" });
    expect(ws.experts.map((e) => e.id)).toEqual(
      expect.arrayContaining(["general", "ventas", "finanzas", "marketing"]),
    );
    expect(ws.experts.find((e) => e.id === "general")?.domains).toHaveLength(4);
    expect(ws.integrations.find((i) => i.id === "gdrive")).toMatchObject({
      connected: false,
      entities: [],
    });
    expect(ws.activity).toEqual([]);
    // Los datos de negocio no se siembran: vacío hasta que un conector real los traiga.
    expect(ws.invoices).toEqual([]);
    expect(ws.campaigns).toEqual([]);
  });

  it("marca hasSnapshot y pending leyendo el snapshot de la actividad", async () => {
    for (const [id, snapshot] of [
      ["evt-snap", { entries: [{ table: "experts", pk: { id: "x" }, before: null }] }],
      ["evt-pending", { pending: { kind: "invoice_reminders", ids: ["inv-1"] } }],
      ["evt-plain", null],
    ] as const) {
      const { orm } = await db.getDb();
      orm
        .insert(schema.activity)
        .values({
          id,
          ts: "2026-01-01T00:00:00.000Z",
          actor: "human",
          actorName: "Propietario local",
          type: "Configuración",
          expertId: "general",
          status: "ok",
          summary: id,
          snapshot: snapshot as never,
        })
        .run();
    }
    const ws = (await fns.getWorkspace()) as {
      activity: { id: string; hasSnapshot: boolean; pending: unknown }[];
    };
    expect(ws.activity.find((a) => a.id === "evt-snap")?.hasSnapshot).toBe(true);
    expect(ws.activity.find((a) => a.id === "evt-pending")?.pending).toEqual({
      kind: "invoice_reminders",
      ids: ["inv-1"],
    });
    expect(ws.activity.find((a) => a.id === "evt-plain")).toMatchObject({
      hasSnapshot: false,
      pending: null,
    });
  });
});

/* ------------------------------- Experts -------------------------------- */

describe("createExpert", () => {
  it("crea el Experto con id derivado del nombre y lo registra en la actividad", async () => {
    const created = (await fns.createExpert({ data: expertPayload() })) as { id: string };
    expect(created.id).toMatch(/^operaciones-[a-z0-9]{3}$/);

    const ws = (await fns.getWorkspace()) as {
      experts: { id: string; name: string; sources: string[]; domains: string[] }[];
      activity: { id: string; summary: string; hasSnapshot: boolean; status: string }[];
    };
    const expert = ws.experts.find((e) => e.id === created.id);
    expect(expert).toMatchObject({
      name: "Operaciones",
      sources: ["gdrive"],
      domains: ["ventas", "clientes"],
    });
    expect(ws.activity[0]).toMatchObject({
      summary: 'Creado Experto "Operaciones"',
      hasSnapshot: true,
      status: "ok",
    });
  });

  it("normaliza acentos y signos al construir el id", async () => {
    const created = (await fns.createExpert({ data: expertPayload({ name: "I+D / Ventas" }) })) as {
      id: string;
    };
    expect(created.id.startsWith("i-d-ventas-")).toBe(true);
  });

  it("rechaza payloads inválidos antes de tocar la base de datos", async () => {
    await expect(fns.createExpert({ data: expertPayload({ name: "   " }) })).rejects.toThrow();
    await expect(
      fns.createExpert({ data: expertPayload({ name: "x".repeat(61) }) }),
    ).rejects.toThrow();
    await expect(
      fns.createExpert({ data: expertPayload({ domains: ["no-existe"] }) }),
    ).rejects.toThrow();
    await expect(
      fns.createExpert({ data: expertPayload({ sources: Array(21).fill("s") }) }),
    ).rejects.toThrow();
  });

  it("admite domains omitido y lo guarda vacío", async () => {
    const payload = expertPayload();
    delete (payload as { domains?: unknown }).domains;
    const created = (await fns.createExpert({ data: payload })) as { id: string };
    const ws = (await fns.getWorkspace()) as { experts: { id: string; domains: string[] }[] };
    expect(ws.experts.find((e) => e.id === created.id)?.domains).toEqual([]);
  });
});

describe("updateExpert", () => {
  it("actualiza y guarda las filas anteriores para poder revertir", async () => {
    const { id } = (await fns.createExpert({ data: expertPayload({ name: "Soporte" }) })) as {
      id: string;
    };
    await fns.updateExpert({
      data: {
        id,
        name: "Soporte 24/7",
        description: "Nueva",
        sources: [],
        domains: ["clientes"],
      },
    });
    const ws = (await fns.getWorkspace()) as { experts: { id: string; name: string }[] };
    expect(ws.experts.find((e) => e.id === id)?.name).toBe("Soporte 24/7");
    const event = await findActivity((a) => a.summary === 'Editado Experto "Soporte 24/7"');
    expect(event?.status).toBe("ok");
    expect(event?.snapshot).toMatchObject({
      entries: [{ table: "experts", before: { id, name: "Soporte" } }],
    });
  });

  it("falla si el Experto no existe", async () => {
    await expect(
      fns.updateExpert({
        data: { id: "fantasma", name: "X", description: "", sources: [], domains: [] },
      }),
    ).rejects.toThrow("Experto no encontrado");
  });
});

describe("deleteExpert", () => {
  it("no permite borrar el Experto General", async () => {
    await expect(fns.deleteExpert({ data: { id: "general" } })).rejects.toThrow(
      "El Experto General no se puede eliminar",
    );
  });

  it("borra el Experto y sus conversaciones", async () => {
    const { id } = (await fns.createExpert({ data: expertPayload({ name: "Temporal" }) })) as {
      id: string;
    };
    await insertChat(id, "c1", "2026-01-01T00:00:00.000Z", userMessage("hola"));
    await fns.deleteExpert({ data: { id } });

    const ws = (await fns.getWorkspace()) as { experts: { id: string }[] };
    expect(ws.experts.some((e) => e.id === id)).toBe(false);
    const { orm } = await db.getDb();
    expect(orm.select().from(schema.chatMessages).all()).toEqual([]);
  });

  it("falla si el Experto no existe", async () => {
    await expect(fns.deleteExpert({ data: { id: "fantasma" } })).rejects.toThrow(
      "Experto no encontrado",
    );
  });
});

/* ----------------------------- Approvals -------------------------------- */

async function insertPendingEvent(id: string, pending: unknown, status = "pending") {
  const { orm } = await db.getDb();
  orm
    .insert(schema.activity)
    .values({
      id,
      ts: "2026-01-01T00:00:00.000Z",
      actor: "agent",
      actorName: "Asistente",
      type: "Cobro",
      expertId: "general",
      status,
      summary: "Reclamar facturas",
      snapshot: { pending } as never,
    })
    .run();
}

describe("decideAction", () => {
  it("no se puede decidir dos veces la misma acción", async () => {
    await expect(
      fns.decideAction({ data: { eventId: "no-existe", approve: true } }),
    ).rejects.toThrow("La acción ya fue resuelta");

    await insertPendingEvent("evt-done", { kind: "invoice_reminders", ids: ["inv-1"] }, "ok");
    await expect(
      fns.decideAction({ data: { eventId: "evt-done", approve: true } }),
    ).rejects.toThrow("La acción ya fue resuelta");
  });

  it("rechaza un snapshot sin una acción pendiente válida", async () => {
    await insertPendingEvent("evt-basura", { kind: "borrar_todo" });
    await expect(
      fns.decideAction({ data: { eventId: "evt-basura", approve: true } }),
    ).rejects.toThrow("Acción pendiente no válida");
  });

  it("al rechazar marca el evento como fallido y no toca las facturas", async () => {
    await insertPendingEvent("evt-rechazo", { kind: "invoice_reminders", ids: ["inv-1"] });
    const { orm } = await db.getDb();
    orm
      .insert(schema.invoices)
      .values({ id: "inv-1", client: "ACME", amount: 10, dueDate: "2026-01-01", status: "open" })
      .run();

    await expect(
      fns.decideAction({ data: { eventId: "evt-rechazo", approve: false } }),
    ).resolves.toEqual({ status: "failed" });

    const event = (await activityRows()).find((a) => a.id === "evt-rechazo");
    expect(event?.status).toBe("failed");
    expect(event?.summary).toBe("Reclamar facturas — rechazado");
    expect(orm.select().from(schema.invoices).all()[0]?.reminders).toBe(0);
  });

  it("al aprobar ejecuta la acción pendiente y guarda el snapshot resultante", async () => {
    await insertPendingEvent("evt-ok", { kind: "invoice_reminders", ids: ["inv-1"] });
    const { orm } = await db.getDb();
    orm
      .insert(schema.invoices)
      .values({ id: "inv-1", client: "ACME", amount: 10, dueDate: "2026-01-01", status: "open" })
      .run();

    await expect(fns.decideAction({ data: { eventId: "evt-ok", approve: true } })).resolves.toEqual(
      { status: "ok" },
    );

    const event = (await activityRows()).find((a) => a.id === "evt-ok");
    expect(event?.status).toBe("ok");
    expect(event?.summary).toBe("Enviadas 1 reclamaciones de cobro (ACME) · aprobado");
    expect(event?.sources).toEqual(["Holded", "Gmail"]);
    expect(event?.snapshot).toMatchObject({
      entries: [{ table: "invoices", pk: { id: "inv-1" } }],
      pending: { kind: "invoice_reminders", ids: ["inv-1"] },
    });
    expect(orm.select().from(schema.invoices).all()[0]?.reminders).toBe(1);
  });

  it("también ejecuta la pausa de campañas", async () => {
    await insertPendingEvent("evt-campanas", { kind: "pause_campaigns", ids: ["cmp-1"] });
    const { orm } = await db.getDb();
    orm.insert(schema.campaigns).values({ id: "cmp-1", name: "Verano", status: "active" }).run();

    await fns.decideAction({ data: { eventId: "evt-campanas", approve: true } });

    expect(orm.select().from(schema.campaigns).all()[0]?.status).toBe("paused");
  });
});

describe("revertEvent", () => {
  it("revierte una creación: el Experto desaparece y el evento queda marcado", async () => {
    const { id } = (await fns.createExpert({ data: expertPayload({ name: "Reversible" }) })) as {
      id: string;
    };
    const created = await findActivity((a) => a.summary === 'Creado Experto "Reversible"');

    await fns.revertEvent({ data: { id: created!.id } });

    const ws = (await fns.getWorkspace()) as {
      experts: { id: string }[];
      activity: { id: string }[];
    };
    expect(ws.experts.some((e) => e.id === id)).toBe(false);
    expect((await activityRows()).find((a) => a.id === created!.id)?.status).toBe("reverted");
    expect(
      (await activityRows()).some((a) => a.type === "Reversión" && a.summary.includes(created!.id)),
    ).toBe(true);
  });

  it("rechaza eventos sin snapshot o ya revertidos", async () => {
    await expect(fns.revertEvent({ data: { id: "no-existe" } })).rejects.toThrow(
      "Este evento no se puede revertir",
    );

    const { orm } = await db.getDb();
    orm
      .insert(schema.activity)
      .values({
        id: "evt-sin-snapshot",
        ts: "2026-01-01T00:00:00.000Z",
        actor: "human",
        actorName: "Propietario local",
        type: "Configuración",
        expertId: "general",
        status: "ok",
        summary: "sin snapshot",
        snapshot: null,
      })
      .run();
    await expect(fns.revertEvent({ data: { id: "evt-sin-snapshot" } })).rejects.toThrow(
      "Este evento no se puede revertir",
    );
  });
});

/* --------------------------------- Chat --------------------------------- */

describe("getChat, clearChat y listConversations", () => {
  it("devuelve solo los mensajes de la conversación pedida, en orden", async () => {
    await insertChat("general", "c1", "2026-01-01T00:00:01.000Z", userMessage("primero"));
    await insertChat("general", "c1", "2026-01-01T00:00:02.000Z", assistantMessage("segundo"));
    await insertChat("general", "c2", "2026-01-01T00:00:03.000Z", userMessage("otra"));

    const result = (await fns.getChat({
      data: { expertId: "general", conversationId: "c1" },
    })) as string;
    expect(JSON.parse(result)).toEqual([userMessage("primero"), assistantMessage("segundo")]);
  });

  it("clearChat borra solo esa conversación", async () => {
    await insertChat("general", "c1", "2026-01-01T00:00:01.000Z", userMessage("primero"));
    await insertChat("general", "c2", "2026-01-01T00:00:02.000Z", userMessage("otra"));

    await fns.clearChat({ data: { expertId: "general", conversationId: "c1" } });

    const { orm } = await db.getDb();
    const rows = orm.select().from(schema.chatMessages).all();
    expect(rows.map((r) => r.conversationId)).toEqual(["c2"]);
  });

  it("resume las conversaciones con título del primer mensaje de usuario y recuento", async () => {
    const base = Date.now() - 3 * 3_600_000;
    const at = (hours: number) => new Date(base + hours * 3_600_000).toISOString();
    await insertChat("general", "c1", at(1), userMessage("  Hola equipo"));
    await insertChat("general", "c1", at(2), assistantMessage("respuesta"));
    await insertChat("general", "c2", at(3), userMessage("Otra consulta"));

    const list = (await fns.listConversations({ data: { expertId: "general" } })) as {
      id: string;
      title: string;
      updatedAt: string;
      count: number;
    }[];
    expect(list.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(list[1]).toMatchObject({ title: "  Hola equipo", count: 2 });
    expect(list[0]).toMatchObject({ title: "Otra consulta", count: 1 });
  });

  it("poda las conversaciones fuera de la retención configurada", async () => {
    chatCfg.retentionDays = 30;
    await insertChat("general", "vieja", "2020-01-01T00:00:00.000Z", userMessage("antigua"));
    await insertChat("general", "nueva", new Date().toISOString(), userMessage("reciente"));

    const list = (await fns.listConversations({ data: { expertId: "general" } })) as {
      id: string;
    }[];
    expect(list.map((c) => c.id)).toEqual(["nueva"]);

    const { orm } = await db.getDb();
    expect(
      orm
        .select()
        .from(schema.chatMessages)
        .all()
        .map((r) => r.conversationId),
    ).toEqual(["nueva"]);
  });

  it("con retención 0 no se guarda ninguna conversación", async () => {
    chatCfg.retentionDays = 0;
    await insertChat("general", "c1", new Date().toISOString(), userMessage("efímera"));
    expect(await fns.listConversations({ data: { expertId: "general" } })).toEqual([]);
  });
});

/* ------------------------------ Google Drive ---------------------------- */

describe("setGrantedFiles y los grants del Picker", () => {
  it("acumula por id, conserva addedAt y resume los tipos en la integración", async () => {
    const pdf = { id: "f-pdf", name: "Factura", mimeType: "application/pdf" };
    const doc = { id: "f-doc", name: "Acta", mimeType: "application/vnd.google-apps.document" };
    const otro = { id: "f-otro", name: "Zip", mimeType: "application/zip" };

    const first = (await fns.setGrantedFiles({ data: { files: [pdf, doc] } })) as {
      ok: boolean;
      count: number;
    };
    expect(first).toEqual({ ok: true, count: 2 });

    const second = (await fns.setGrantedFiles({ data: { files: [pdf, otro] } })) as {
      count: number;
    };
    expect(second.count).toBe(3);

    const grants = (await fns.getGrantedFiles()) as { files: { id: string; addedAt: string }[] };
    const storedPdf = grants.files.find((f) => f.id === "f-pdf");
    expect(grants.files.map((f) => f.id)).toEqual(["f-pdf", "f-doc", "f-otro"]);
    expect(storedPdf?.addedAt).toBe(grants.files[0]?.addedAt);

    const ws = (await fns.getWorkspace()) as {
      integrations: {
        id: string;
        connected: boolean;
        entities: { name: string; count: number }[];
      }[];
    };
    const gdrive = ws.integrations.find((i) => i.id === "gdrive")!;
    expect(gdrive.connected).toBe(true);
    expect(gdrive.entities).toEqual(
      expect.arrayContaining([
        { name: "PDF", count: 1 },
        { name: "Documentos", count: 1 },
        { name: "Otros archivos", count: 1 },
      ]),
    );
  });

  it("rechaza un grant sin id", async () => {
    await expect(
      fns.setGrantedFiles({
        data: { files: [{ id: "", name: "x", mimeType: "application/pdf" }] },
      }),
    ).rejects.toThrow();
  });

  it("sin grants concedidos la lista está vacía", async () => {
    expect(await fns.getGrantedFiles()).toEqual({ files: [] });
  });
});

describe("consentimiento de Drive y configuración pública", () => {
  it("guarda el consentimiento con la URL de privacidad por defecto", async () => {
    const accepted = (await fns.acceptDriveConsent()) as {
      ok: boolean;
      at: string;
      privacyUrl: string;
    };
    expect(accepted.ok).toBe(true);
    expect(accepted.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(accepted.privacyUrl).toContain("PRIVACY.md");

    const stored = (await fns.getDriveConsent()) as {
      consent: { at: string; privacyUrl: string };
    };
    expect(stored.consent).toEqual({ at: accepted.at, privacyUrl: accepted.privacyUrl });
  });

  it("acepta la URL de privacidad configurada y la devuelve en privacyUrl", async () => {
    process.env["OPENEXPERT_PRIVACY_URL"] = "  https://example.test/privacidad  ";
    await fns.acceptDriveConsent();
    expect(await fns.privacyUrl()).toEqual({ url: "https://example.test/privacidad" });
    expect(await fns.getDriveConsent()).toMatchObject({
      consent: { privacyUrl: "https://example.test/privacidad" },
    });
  });

  it("getClientConfig solo expone identificadores públicos y prefiere el prefijo OpenExpert", async () => {
    process.env["GOOGLE_CLIENT_ID"] = "generico";
    process.env["OPENEXPERT_GOOGLE_CLIENT_ID"] = " propio ";
    process.env["GOOGLE_PICKER_API_KEY"] = " pk ";
    process.env["GOOGLE_PICKER_APP_ID"] = " 123 ";

    expect(await fns.getClientConfig()).toEqual({
      pickerKey: "pk",
      pickerAppId: "123",
      googleClientId: "propio",
      privacyUrl: "https://github.com/OpenExpert-ai/OpenExpert/blob/main/PRIVACY.md",
    });

    delete process.env["OPENEXPERT_GOOGLE_CLIENT_ID"];
    expect(((await fns.getClientConfig()) as { googleClientId: string }).googleClientId).toBe(
      "generico",
    );
  });
});

describe("getDriveStatus y el token de acceso", () => {
  it("sin tokens ni configuración: desconectado, sin archivos concedidos", async () => {
    expect(await fns.getDriveStatus()).toEqual({
      connected: false,
      scopes: null,
      configured: false,
      granted: [],
    });
  });

  it("getDriveAccessToken explica que falta conectar en vez de devolver undefined", async () => {
    await expect(fns.getDriveAccessToken()).rejects.toThrow(
      "Google Drive no está conectado. Selecciona archivos desde Integraciones → Fuentes.",
    );
  });

  it("getDriveAccessToken devuelve el token vigente", async () => {
    local.saveTokens({
      access_token: "ya29.vigente",
      refresh_token: null,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(await fns.getDriveAccessToken()).toEqual({ accessToken: "ya29.vigente" });
    expect(await fns.getDriveStatus()).toMatchObject({ connected: true, configured: false });
  });

  it("si el token caducó y no hay refresh token, lo dice", async () => {
    local.saveTokens({
      access_token: "ya29.caducado",
      refresh_token: null,
      expires_at: new Date(Date.now() - 3600_000).toISOString(),
    });
    await expect(fns.getDriveAccessToken()).rejects.toThrow("la autorización caducó");
  });
});

describe("startDriveAuth", () => {
  it("falla con un mensaje claro si falta el cliente OAuth", async () => {
    await expect(fns.startDriveAuth()).rejects.toThrow(
      "Falta configurar el cliente OAuth de Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
    );
  });

  it("construye la URL de autorización con PKCE y el origen configurado", async () => {
    process.env["OPENEXPERT_GOOGLE_CLIENT_ID"] = "cliente.apps.googleusercontent.com";
    process.env["GOOGLE_CLIENT_SECRET"] = "secreto";
    process.env["PUBLIC_APP_URL"] = "https://app.example.com/";

    const { url } = (await fns.startDriveAuth()) as { url: string };
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("client_id")).toBe("cliente.apps.googleusercontent.com");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/auth/google/callback",
    );
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    expect(parsed.searchParams.get("state")).toBeTruthy();

    // El state lleva el verifier y el challenge enviado es su SHA-256 en base64url.
    const verifier = parsed.searchParams.get("state")!.split(".")[1]!;
    expect(parsed.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
  });

  it("sin PUBLIC_APP_URL usa el origen de la petición", async () => {
    process.env["OPENEXPERT_GOOGLE_CLIENT_ID"] = "cliente";
    process.env["GOOGLE_CLIENT_SECRET"] = "secreto";
    const { url } = (await fns.startDriveAuth()) as { url: string };
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/auth/google/callback",
    );
  });
});

describe("disconnectDrive y syncIntegration", () => {
  const grants = [{ id: "f1", name: "Acta", mimeType: "application/pdf", addedAt: "2026-01-01" }];

  it("desconectar borra tokens, grants y consentimiento, y marca la integración", async () => {
    local.saveTokens({ access_token: "a", refresh_token: null, expires_at: "2030-01-01" });
    local.saveGrantedFiles(grants);
    local.saveDriveConsent({ at: "2026-01-01", privacyUrl: "https://example.test" });

    await fns.disconnectDrive();

    expect(local.loadTokens()).toBeNull();
    expect(local.loadGrantedFiles()).toEqual([]);
    expect(local.loadDriveConsent()).toBeNull();
    const ws = (await fns.getWorkspace()) as {
      integrations: { id: string; connected: boolean; entities: unknown[] }[];
    };
    expect(ws.integrations.find((i) => i.id === "gdrive")).toMatchObject({
      connected: false,
      entities: [],
    });
  });

  it("syncIntegration exige una conexión activa", async () => {
    await expect(fns.syncIntegration({ data: { id: "gdrive" } })).rejects.toThrow(
      "Primero selecciona archivos de Google Drive en Fuentes.",
    );
  });

  it("sincronizar resume los grants y deja constancia en la actividad", async () => {
    local.saveTokens({ access_token: "a", refresh_token: null, expires_at: "2030-01-01" });
    local.saveGrantedFiles(grants);

    await fns.syncIntegration({ data: { id: "gdrive" } });

    const ws = (await fns.getWorkspace()) as {
      integrations: {
        id: string;
        connected: boolean;
        entities: { name: string; count: number }[];
      }[];
      activity: { type: string; summary: string; sources: string[] }[];
    };
    expect(ws.integrations.find((i) => i.id === "gdrive")).toMatchObject({
      connected: true,
      entities: [{ name: "PDF", count: 1 }],
    });
    expect(ws.activity[0]).toMatchObject({
      type: "Integración",
      summary: "Sincronizado Google Drive (1 archivos concedidos)",
      sources: ["Google Drive"],
    });
  });

  it("solo acepta gdrive como integración sincronizable", async () => {
    await expect(fns.syncIntegration({ data: { id: "notion" } })).rejects.toThrow();
  });
});

/* ------------------------------- Carpetas -------------------------------- */

describe("carpetas locales", () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "openexpert-root-"));
    mkdirSync(join(folder, "sub"));
    writeFileSync(join(folder, "nota.txt"), "hola");
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it("browseLocalDir lista el directorio pedido", async () => {
    const listing = (await fns.browseLocalDir({ data: { path: folder } })) as {
      path: string;
      entries: { name: string; isDirectory: boolean }[];
    };
    expect(listing.path).toBe(folder);
    expect(listing.entries.map((e) => e.name)).toEqual(expect.arrayContaining(["sub", "nota.txt"]));
    expect(listing.entries.find((e) => e.name === "sub")?.isDirectory).toBe(true);
    expect(listing.entries.find((e) => e.name === "nota.txt")?.isDirectory).toBe(false);
  });

  it("addLocalRoot resuelve la ruta, es idempotente y actualiza la integración", async () => {
    const first = (await fns.addLocalRoot({ data: { path: `${folder}/` } })) as {
      roots: { path: string; name: string }[];
    };
    expect(first.roots).toEqual([
      expect.objectContaining({ path: folder, name: folder.split("/").pop() }),
    ]);

    const again = (await fns.addLocalRoot({ data: { path: folder } })) as {
      roots: unknown[];
    };
    expect(again.roots).toHaveLength(1);

    const ws = (await fns.getWorkspace()) as {
      integrations: { id: string; connected: boolean; entities: unknown[] }[];
      activity: { summary: string }[];
    };
    expect(ws.integrations.find((i) => i.id === "local")).toMatchObject({
      connected: true,
      entities: [{ name: "Carpetas", count: 1 }],
    });
    expect(ws.activity[0]?.summary).toContain('Añadida carpeta local "');
    expect(await fns.getLocalRoots()).toEqual({ roots: first.roots });
  });

  it("addLocalRoot rechaza rutas inexistentes y ficheros", async () => {
    await expect(fns.addLocalRoot({ data: { path: join(folder, "no-existe") } })).rejects.toThrow(
      "La carpeta no existe o no se puede leer.",
    );
    await expect(fns.addLocalRoot({ data: { path: join(folder, "nota.txt") } })).rejects.toThrow(
      "Eso no es una carpeta.",
    );
  });

  it("removeLocalRoot la quita y deja la integración desconectada", async () => {
    await fns.addLocalRoot({ data: { path: folder } });
    const result = (await fns.removeLocalRoot({ data: { path: folder } })) as {
      roots: unknown[];
    };
    expect(result.roots).toEqual([]);

    const ws = (await fns.getWorkspace()) as {
      integrations: { id: string; connected: boolean; entities: unknown[] }[];
    };
    expect(ws.integrations.find((i) => i.id === "local")).toMatchObject({
      connected: false,
      entities: [],
    });
  });
});

/* --------------------------------- Notion -------------------------------- */

describe("Notion", () => {
  it("sin configurar: estado desconectado y error claro al conectar", async () => {
    expect(await fns.getNotionStatus()).toEqual({
      connected: false,
      workspace: null,
      configured: false,
    });
    await expect(fns.startNotionAuth()).rejects.toThrow(
      "Falta configurar el cliente OAuth de Notion (NOTION_CLIENT_ID / NOTION_CLIENT_SECRET).",
    );
  });

  it("construye la URL de autorización con el cliente configurado", async () => {
    process.env["OPENEXPERT_NOTION_CLIENT_ID"] = "notion-client";
    process.env["NOTION_CLIENT_SECRET"] = "notion-secret";
    process.env["PUBLIC_APP_URL"] = "https://app.example.com";

    const { url } = (await fns.startNotionAuth()) as { url: string };
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://api.notion.com/v1/oauth/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("notion-client");
    expect(parsed.searchParams.get("owner")).toBe("user");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/auth/notion/callback",
    );
    expect(parsed.searchParams.get("state")).toBeTruthy();
    expect(await fns.getNotionStatus()).toMatchObject({ configured: true });
  });

  it("disconnectNotion borra el token y marca la integración", async () => {
    local.saveNotionToken({
      access_token: "secret_notion",
      workspace_id: "ws",
      workspace_name: "Espacio",
      bot_id: null,
      connected_at: "2026-01-01T00:00:00.000Z",
    });
    expect(await fns.getNotionStatus()).toEqual({
      connected: true,
      workspace: "Espacio",
      configured: false,
    });

    await fns.disconnectNotion();

    expect(local.loadNotionToken()).toBeNull();
    const ws = (await fns.getWorkspace()) as {
      integrations: { id: string; connected: boolean }[];
    };
    expect(ws.integrations.find((i) => i.id === "notion")?.connected).toBe(false);
    expect((await activityRows()).some((row) => row.summary === "Desconectado Notion")).toBe(true);
  });
});
