-- SPDX-License-Identifier: MIT
-- SQLite schema for the local edition. Applied idempotently at startup.
-- Keep in sync with drizzle/schema.ts.

CREATE TABLE IF NOT EXISTS experts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sources TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS processes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  trigger TEXT NOT NULL DEFAULT '',
  stages TEXT NOT NULL DEFAULT '[]',
  limits TEXT NOT NULL DEFAULT '[]',
  approval TEXT NOT NULL DEFAULT 'Ninguna',
  expert_id TEXT NOT NULL DEFAULT 'general',
  active INTEGER NOT NULL DEFAULT 1,
  runs INTEGER NOT NULL DEFAULT 0,
  last_run TEXT
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  connected INTEGER NOT NULL DEFAULT 0,
  entities TEXT NOT NULL DEFAULT '[]',
  last_sync TEXT
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  type TEXT NOT NULL,
  expert_id TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  duration_ms INTEGER NOT NULL DEFAULT 300,
  snapshot TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  expert_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL DEFAULT 'default',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  stage TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  owner TEXT NOT NULL DEFAULT '',
  days_in_stage INTEGER NOT NULL DEFAULT 0,
  close_date TEXT,
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  client TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reminders INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  spend_7d REAL NOT NULL DEFAULT 0,
  conversions_7d INTEGER NOT NULL DEFAULT 0,
  cpa_target REAL NOT NULL DEFAULT 0,
  daily_budget REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mrr REAL NOT NULL DEFAULT 0,
  usage_trend REAL NOT NULL DEFAULT 0,
  open_tickets INTEGER NOT NULL DEFAULT 0,
  churn_risk REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS chat_messages_expert_conv ON chat_messages (expert_id, conversation_id);
CREATE INDEX IF NOT EXISTS activity_ts ON activity (ts DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
