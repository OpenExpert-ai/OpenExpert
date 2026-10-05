// SPDX-License-Identifier: MIT
// Drizzle schema for the local SQLite database. Single-owner model: no
// profiles, roles, expert_access or invitations.
//
// Keep in sync with drizzle/init.sql (the DDL applied at startup). The two
// describe the same tables; schema.ts is for typed queries, init.sql for
// creation.

import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const experts = sqliteTable("experts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  sources: text("sources", { mode: "json" }).$type<string[]>().notNull().default([]),
  // Business domains the Expert may read. Empty = no business data (chat and
  // Drive only). Added by migration 0002, so it is intentionally absent from
  // the baseline init.sql.
  domains: text("domains", { mode: "json" }).$type<string[]>().notNull().default([]),
  createdAt: text("created_at").notNull(),
});

export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  connected: integer("connected", { mode: "boolean" }).notNull().default(false),
  entities: text("entities", { mode: "json" })
    .$type<{ name: string; count: number }[]>()
    .notNull()
    .default([]),
  lastSync: text("last_sync"),
});

export const activity = sqliteTable("activity", {
  id: text("id").primaryKey(),
  ts: text("ts").notNull(),
  actor: text("actor").notNull(),
  actorName: text("actor_name").notNull(),
  type: text("type").notNull(),
  expertId: text("expert_id").notNull().default("general"),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  sources: text("sources", { mode: "json" }).$type<string[]>().notNull().default([]),
  durationMs: integer("duration_ms").notNull().default(300),
  snapshot: text("snapshot", { mode: "json" }).$type<unknown>(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  expertId: text("expert_id").notNull(),
  conversationId: text("conversation_id").notNull().default("default"),
  message: text("message", { mode: "json" }).$type<unknown>().notNull(),
  createdAt: text("created_at").notNull(),
});

export const deals = sqliteTable("deals", {
  id: text("id").primaryKey(),
  company: text("company").notNull(),
  stage: text("stage").notNull(),
  value: real("value").notNull().default(0),
  owner: text("owner").notNull().default(""),
  daysInStage: integer("days_in_stage").notNull().default(0),
  closeDate: text("close_date"),
  status: text("status").notNull().default("open"),
});

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  client: text("client").notNull(),
  amount: real("amount").notNull().default(0),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("open"),
  reminders: integer("reminders").notNull().default(0),
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  channel: text("channel").notNull().default(""),
  status: text("status").notNull().default("active"),
  spend7d: real("spend_7d").notNull().default(0),
  conversions7d: integer("conversions_7d").notNull().default(0),
  cpaTarget: real("cpa_target").notNull().default(0),
  dailyBudget: real("daily_budget").notNull().default(0),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mrr: real("mrr").notNull().default(0),
  usageTrend: real("usage_trend").notNull().default(0),
  openTickets: integer("open_tickets").notNull().default(0),
  churnRisk: real("churn_risk").notNull().default(0),
});

// Key/value store for UI preferences (theme, density, language).
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: text("updated_at").notNull(),
});
