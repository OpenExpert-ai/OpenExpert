-- SPDX-License-Identifier: MIT
-- Existing rows keep unknown import provenance.

CREATE TABLE deals_provenance_new (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  stage TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  owner TEXT NOT NULL DEFAULT '',
  days_in_stage INTEGER NOT NULL DEFAULT 0,
  close_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  import_source TEXT,
  imported_at TEXT
);
INSERT INTO deals_provenance_new (id, company, stage, value, owner, days_in_stage, close_date, status) SELECT id, company, stage, value, owner, days_in_stage, close_date, status FROM deals;
DROP TABLE deals;
ALTER TABLE deals_provenance_new RENAME TO deals;

CREATE TABLE invoices_provenance_new (
  id TEXT PRIMARY KEY,
  client TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reminders INTEGER NOT NULL DEFAULT 0,
  import_source TEXT,
  imported_at TEXT
);
INSERT INTO invoices_provenance_new (id, client, amount, due_date, status, reminders) SELECT id, client, amount, due_date, status, reminders FROM invoices;
DROP TABLE invoices;
ALTER TABLE invoices_provenance_new RENAME TO invoices;

CREATE TABLE campaigns_provenance_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  spend_7d REAL NOT NULL DEFAULT 0,
  conversions_7d INTEGER NOT NULL DEFAULT 0,
  cpa_target REAL NOT NULL DEFAULT 0,
  daily_budget REAL NOT NULL DEFAULT 0,
  import_source TEXT,
  imported_at TEXT
);
INSERT INTO campaigns_provenance_new (id, name, channel, status, spend_7d, conversions_7d, cpa_target, daily_budget) SELECT id, name, channel, status, spend_7d, conversions_7d, cpa_target, daily_budget FROM campaigns;
DROP TABLE campaigns;
ALTER TABLE campaigns_provenance_new RENAME TO campaigns;

CREATE TABLE accounts_provenance_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mrr REAL NOT NULL DEFAULT 0,
  usage_trend REAL NOT NULL DEFAULT 0,
  open_tickets INTEGER NOT NULL DEFAULT 0,
  churn_risk REAL NOT NULL DEFAULT 0,
  import_source TEXT,
  imported_at TEXT
);
INSERT INTO accounts_provenance_new (id, name, mrr, usage_trend, open_tickets, churn_risk) SELECT id, name, mrr, usage_trend, open_tickets, churn_risk FROM accounts;
DROP TABLE accounts;
ALTER TABLE accounts_provenance_new RENAME TO accounts;
