// SPDX-License-Identifier: MIT
// Los estados de las tablas de negocio son cuatro palabras en inglés y todos los
// lectores comparan contra ellas (`ee.server.ts`, `ai/tools.ts`), pero el
// importador de CSV guardaba la celda tal cual: un CRM que exporta en castellano
// dejaba filas que ni el panel ni el asistente veían. El vocabulario canónico y
// las formas que el importador acepta viven aquí, para que el parser y los
// lectores usen una sola lista y no dos que se separen.

/** Valores canónicos de `deals.status`: lo único que comparan los lectores. */
export const DEAL_STATUS = { open: "open", won: "won", lost: "lost" } as const;

/** Valores canónicos de `invoices.status`. */
export const INVOICE_STATUS = {
  open: "open",
  paid: "paid",
  overdue: "overdue",
  cancelled: "cancelled",
} as const;

/** Valores canónicos de `campaigns.status`. */
export const CAMPAIGN_STATUS = { active: "active", paused: "paused" } as const;

export type StatusEntity = "deals" | "invoices" | "campaigns";

/** El orden canónico, que es también el que muestra el mensaje de error. */
export const STATUS_VOCABULARY: Record<StatusEntity, readonly string[]> = {
  deals: Object.values(DEAL_STATUS),
  invoices: Object.values(INVOICE_STATUS),
  campaigns: Object.values(CAMPAIGN_STATUS),
};

/** Cómo se llama cada entidad en el aviso al usuario. */
const ENTITY_LABEL: Record<StatusEntity, string> = {
  deals: "ventas",
  invoices: "facturas",
  campaigns: "campañas",
};

/**
 * Las grafías que el importador acepta además de la canónica: castellano, con
 * tilde o sin ella, en mayúsculas o minúsculas, y los nombres que usan los CRM
 * en inglés («Closed Won», «enabled»).
 */
const ALIASES: Record<StatusEntity, Record<string, string>> = {
  deals: {
    abierto: DEAL_STATUS.open,
    abierta: DEAL_STATUS.open,
    "en curso": DEAL_STATUS.open,
    "en progreso": DEAL_STATUS.open,
    ganado: DEAL_STATUS.won,
    ganada: DEAL_STATUS.won,
    ganados: DEAL_STATUS.won,
    ganadas: DEAL_STATUS.won,
    "closed won": DEAL_STATUS.won,
    "cerrado ganado": DEAL_STATUS.won,
    "cerrada ganada": DEAL_STATUS.won,
    perdido: DEAL_STATUS.lost,
    perdida: DEAL_STATUS.lost,
    perdidos: DEAL_STATUS.lost,
    perdidas: DEAL_STATUS.lost,
    "closed lost": DEAL_STATUS.lost,
    "cerrado perdido": DEAL_STATUS.lost,
    "cerrada perdida": DEAL_STATUS.lost,
  },
  invoices: {
    pendiente: INVOICE_STATUS.open,
    pendientes: INVOICE_STATUS.open,
    abierta: INVOICE_STATUS.open,
    abierto: INVOICE_STATUS.open,
    "sin pagar": INVOICE_STATUS.open,
    pagada: INVOICE_STATUS.paid,
    pagado: INVOICE_STATUS.paid,
    pagadas: INVOICE_STATUS.paid,
    pagados: INVOICE_STATUS.paid,
    cobrada: INVOICE_STATUS.paid,
    cobrado: INVOICE_STATUS.paid,
    vencida: INVOICE_STATUS.overdue,
    vencido: INVOICE_STATUS.overdue,
    vencidas: INVOICE_STATUS.overdue,
    vencidos: INVOICE_STATUS.overdue,
    anulada: INVOICE_STATUS.cancelled,
    anulado: INVOICE_STATUS.cancelled,
    cancelada: INVOICE_STATUS.cancelled,
    cancelado: INVOICE_STATUS.cancelled,
    canceled: INVOICE_STATUS.cancelled,
  },
  campaigns: {
    activa: CAMPAIGN_STATUS.active,
    activo: CAMPAIGN_STATUS.active,
    activas: CAMPAIGN_STATUS.active,
    activos: CAMPAIGN_STATUS.active,
    enabled: CAMPAIGN_STATUS.active,
    encendida: CAMPAIGN_STATUS.active,
    pausada: CAMPAIGN_STATUS.paused,
    pausado: CAMPAIGN_STATUS.paused,
    pausadas: CAMPAIGN_STATUS.paused,
    pausados: CAMPAIGN_STATUS.paused,
    disabled: CAMPAIGN_STATUS.paused,
    apagada: CAMPAIGN_STATUS.paused,
  },
};

/**
 * Minúsculas, sin tildes y con la puntuación convertida en espacio: «Ganada.»,
 * «CLOSED  WON» y «en curso» llegan como «ganada», «closed won» y «en curso».
 */
function key(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function indexOf(entity: StatusEntity): Map<string, string> {
  const map = new Map<string, string>();
  for (const canonical of STATUS_VOCABULARY[entity]) map.set(key(canonical), canonical);
  for (const [alias, canonical] of Object.entries(ALIASES[entity])) map.set(key(alias), canonical);
  return map;
}

const INDEX: Record<StatusEntity, Map<string, string>> = {
  deals: indexOf("deals"),
  invoices: indexOf("invoices"),
  campaigns: indexOf("campaigns"),
};

/**
 * El valor canónico de una celda de estado, o `null` si no está en el
 * vocabulario. Una celda vacía no se pregunta aquí: cada importador decide su
 * valor por defecto (`open` en ventas y facturas, `active` en campañas).
 */
export function canonicalStatus(entity: StatusEntity, value: string): string | null {
  return INDEX[entity].get(key(value)) ?? null;
}

/** Lo que lee el usuario cuando su fichero trae un estado que no conocemos. */
export function unknownStatusMessage(entity: StatusEntity, value: string): string {
  const accepted = STATUS_VOCABULARY[entity].join(", ");
  return `El campo status (estado) de ${ENTITY_LABEL[entity]} no admite «${value}». Usa uno de: ${accepted}.`;
}
