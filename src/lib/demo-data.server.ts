// SPDX-License-Identifier: MIT
// Demo rows for the first-run experience. They are deliberately marked with a
// `demo-` id so the owner can remove them without touching real data.
import { like } from "drizzle-orm";
import { getDb, persist } from "./db.server";
import * as ee from "./ee.server";
import * as schema from "../../drizzle/schema";
import type { AccountInput, CampaignInput, DealInput, InvoiceInput } from "./business-csv";

const DEMO_DEALS: DealInput[] = [
  {
    id: "demo-deal-1",
    company: "Clínica Dental Málaga",
    stage: "Negociación",
    value: 8400,
    owner: "Ana",
    daysInStage: 12,
    closeDate: "2026-11-15",
    status: "open",
  },
  {
    id: "demo-deal-2",
    company: "Talleres Axarquía",
    stage: "Propuesta",
    value: 3200,
    owner: "Luis",
    daysInStage: 24,
    closeDate: "2026-11-30",
    status: "open",
  },
  {
    id: "demo-deal-3",
    company: "Grupo Costa Sol",
    stage: "Negociación",
    value: 15800,
    owner: "Ana",
    daysInStage: 31,
    closeDate: "2026-12-12",
    status: "open",
  },
  {
    id: "demo-deal-4",
    company: "Panadería La Espiga",
    stage: "Contacto",
    value: 1800,
    owner: "Marta",
    daysInStage: 6,
    closeDate: "2026-12-20",
    status: "open",
  },
  {
    id: "demo-deal-5",
    company: "Hotel Bahía",
    stage: "Ganada",
    value: 24500,
    owner: "Luis",
    daysInStage: 3,
    closeDate: "2026-10-20",
    status: "won",
  },
  {
    id: "demo-deal-6",
    company: "Óptica Centro",
    stage: "Propuesta",
    value: 4600,
    owner: "Marta",
    daysInStage: 18,
    closeDate: "2026-12-05",
    status: "open",
  },
  {
    id: "demo-deal-7",
    company: "Reformas del Sur",
    stage: "Contacto",
    value: 9200,
    owner: "Ana",
    daysInStage: 9,
    closeDate: "2027-01-15",
    status: "open",
  },
  {
    id: "demo-deal-8",
    company: "Distribuciones Vega",
    stage: "Perdida",
    value: 5600,
    owner: "Luis",
    daysInStage: 2,
    closeDate: "2026-10-10",
    status: "lost",
  },
];

const DEMO_INVOICES: InvoiceInput[] = [
  {
    id: "demo-inv-1",
    client: "Clínica Dental Málaga",
    amount: 2400,
    dueDate: "2026-09-15",
    status: "open",
    reminders: 2,
  },
  {
    id: "demo-inv-2",
    client: "Talleres Axarquía",
    amount: 6800,
    dueDate: "2026-09-30",
    status: "open",
    reminders: 3,
  },
  {
    id: "demo-inv-3",
    client: "Grupo Costa Sol",
    amount: 12000,
    dueDate: "2026-10-05",
    status: "open",
    reminders: 1,
  },
  {
    id: "demo-inv-4",
    client: "Panadería La Espiga",
    amount: 950,
    dueDate: "2026-10-12",
    status: "open",
    reminders: 0,
  },
  {
    id: "demo-inv-5",
    client: "Óptica Centro",
    amount: 3100,
    dueDate: "2026-08-20",
    status: "paid",
    reminders: 2,
  },
  {
    id: "demo-inv-6",
    client: "Hotel Bahía",
    amount: 7800,
    dueDate: "2026-10-25",
    status: "open",
    reminders: 1,
  },
  {
    id: "demo-inv-7",
    client: "Reformas del Sur",
    amount: 5400,
    dueDate: "2026-09-08",
    status: "open",
    reminders: 2,
  },
];

const DEMO_CAMPAIGNS: CampaignInput[] = [
  {
    id: "demo-camp-1",
    name: "Captación clínicas",
    channel: "Google Ads",
    status: "active",
    spend7d: 840,
    conversions7d: 11,
    cpaTarget: 70,
    dailyBudget: 120,
  },
  {
    id: "demo-camp-2",
    name: "Retargeting hoteles",
    channel: "Meta Ads",
    status: "active",
    spend7d: 620,
    conversions7d: 5,
    cpaTarget: 90,
    dailyBudget: 80,
  },
  {
    id: "demo-camp-3",
    name: "Newsletter pymes",
    channel: "Email",
    status: "active",
    spend7d: 120,
    conversions7d: 14,
    cpaTarget: 15,
    dailyBudget: 20,
  },
  {
    id: "demo-camp-4",
    name: "Marca en LinkedIn",
    channel: "LinkedIn",
    status: "paused",
    spend7d: 310,
    conversions7d: 2,
    cpaTarget: 120,
    dailyBudget: 45,
  },
];

const DEMO_ACCOUNTS: AccountInput[] = [
  {
    id: "demo-acc-1",
    name: "Clínica Dental Málaga",
    mrr: 700,
    usageTrend: 0.18,
    openTickets: 1,
    churnRisk: 0.12,
  },
  {
    id: "demo-acc-2",
    name: "Grupo Costa Sol",
    mrr: 1450,
    usageTrend: -0.22,
    openTickets: 4,
    churnRisk: 0.58,
  },
  {
    id: "demo-acc-3",
    name: "Talleres Axarquía",
    mrr: 380,
    usageTrend: 0.04,
    openTickets: 0,
    churnRisk: 0.2,
  },
  {
    id: "demo-acc-4",
    name: "Hotel Bahía",
    mrr: 2100,
    usageTrend: 0.31,
    openTickets: 2,
    churnRisk: 0.08,
  },
  {
    id: "demo-acc-5",
    name: "Óptica Centro",
    mrr: 420,
    usageTrend: -0.35,
    openTickets: 3,
    churnRisk: 0.71,
  },
];

/** Insert the demo rows, replacing any previous demo batch. */
export async function loadDemoData(): Promise<{ deals: number; invoices: number }> {
  const { orm } = await getDb();
  for (const row of DEMO_DEALS)
    orm
      .insert(schema.deals)
      .values(row)
      .onConflictDoUpdate({ target: schema.deals.id, set: row })
      .run();
  for (const row of DEMO_INVOICES)
    orm
      .insert(schema.invoices)
      .values(row)
      .onConflictDoUpdate({ target: schema.invoices.id, set: row })
      .run();
  for (const row of DEMO_CAMPAIGNS)
    orm
      .insert(schema.campaigns)
      .values(row)
      .onConflictDoUpdate({ target: schema.campaigns.id, set: row })
      .run();
  for (const row of DEMO_ACCOUNTS)
    orm
      .insert(schema.accounts)
      .values(row)
      .onConflictDoUpdate({ target: schema.accounts.id, set: row })
      .run();
  await persist();
  await ee.logActivity({
    actor: "human",
    actor_name: "Propietario local",
    type: "Datos",
    expert_id: "general",
    status: "ok",
    summary: "Cargados los datos de ejemplo",
    sources: ["Demo"],
  });
  return { deals: DEMO_DEALS.length, invoices: DEMO_INVOICES.length };
}

/** Remove only the demo rows; real data is untouched. */
export async function clearDemoData(): Promise<void> {
  const { orm } = await getDb();
  for (const table of [schema.deals, schema.invoices, schema.campaigns, schema.accounts]) {
    orm.delete(table).where(like(table.id, "demo-%")).run();
  }
  await persist();
  await ee.logActivity({
    actor: "human",
    actor_name: "Propietario local",
    type: "Datos",
    expert_id: "general",
    status: "ok",
    summary: "Quitados los datos de ejemplo",
    sources: ["Demo"],
  });
}
