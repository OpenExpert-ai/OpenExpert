# 03 · Data model

> **Audience:** engineering + business. The database is a single local SQLite file.

---

## 1. Overview

One SQLite file at `OPENEXPERT_DATA_DIR/openexpert.db` (default
`~/.openexpert/`). The typed schema is `drizzle/schema.ts`; the baseline DDL is
`drizzle/init.sql` and incremental migrations live in `drizzle/migrations/`
(applied at startup by `src/lib/db.server.ts`). JSON columns are stored as
`TEXT`.

Tables: `experts`, `processes`, `integrations`, `activity`, `chat_messages`,
`deals`, `invoices`, `campaigns`, `accounts`, `settings`.

On first run `src/lib/db.server.ts` seeds the **configuration** (Experts,
processes, integrations). The business tables (`deals`, `invoices`, `campaigns`,
`accounts`) start **empty**: they are only filled by a real connector or an
import. Business tools report whether a source is connected and never present
local fixtures as real data. Delete the database file to re-seed the
configuration.

## 2. Tables

### `experts` — Experts

| Column        | Type        | Notes                                                                                                |
| ------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `id`          | TEXT PK     | Human-readable id (`general`, `ventas`, …)                                                           |
| `name`        | TEXT        | Display name                                                                                         |
| `description` | TEXT        | Injected into the system prompt                                                                      |
| `sources`     | TEXT (JSON) | Authorised connectors, e.g. `["gdrive"]`                                                             |
| `domains`     | TEXT (JSON) | Business domains it may read, e.g. `["ventas"]`; empty = no business data. Added by migration `0002` |
| `created_at`  | TEXT        | ISO timestamp                                                                                        |

### `processes` — autonomous processes

| Column                           | Type        | Notes                         |
| -------------------------------- | ----------- | ----------------------------- |
| `id`                             | TEXT PK     | `p-` prefix + short name      |
| `name`, `description`, `trigger` | TEXT        | `trigger` is descriptive text |
| `stages`, `limits`               | TEXT (JSON) | String arrays                 |
| `approval`                       | TEXT        | `Ninguna` or `Requerida`      |
| `expert_id`                      | TEXT        | Owning Expert                 |
| `active`                         | INTEGER     | 0/1                           |
| `runs`                           | INTEGER     | Run counter                   |
| `last_run`                       | TEXT        | ISO timestamp or null         |

### `integrations` — connector catalogue

| Column             | Type        | Notes                                     |
| ------------------ | ----------- | ----------------------------------------- |
| `id`               | TEXT PK     | `gdrive`, `pipedrive`, …                  |
| `name`, `category` | TEXT        | —                                         |
| `connected`        | INTEGER     | 0/1; only `gdrive` can be connected today |
| `entities`         | TEXT (JSON) | `[{ name, count }]` from the last sync    |
| `last_sync`        | TEXT        | ISO timestamp or null                     |

### `activity` — audit log

| Column        | Type        | Notes                                                      |
| ------------- | ----------- | ---------------------------------------------------------- |
| `id`          | TEXT PK     | `evt_` + 8 chars                                           |
| `ts`          | TEXT        | ISO timestamp                                              |
| `actor`       | TEXT        | `human` or `agent`                                         |
| `actor_name`  | TEXT        | Display name                                               |
| `type`        | TEXT        | `Configuración`, `Consulta`, `Integración`, `Seguridad`, … |
| `expert_id`   | TEXT        | Affected Expert                                            |
| `status`      | TEXT        | `ok`, `pending`, `denied`, `failed`, `reverted`            |
| `summary`     | TEXT        | One-line description                                       |
| `sources`     | TEXT (JSON) | Information sources                                        |
| `duration_ms` | INTEGER     | Duration                                                   |
| `snapshot`    | TEXT (JSON) | `{ entries }` (for revert) or `{ pending }`                |

### `chat_messages` — conversations

| Column            | Type        | Notes                         |
| ----------------- | ----------- | ----------------------------- |
| `id`              | TEXT PK     | UUID                          |
| `expert_id`       | TEXT        | Expert of the conversation    |
| `conversation_id` | TEXT        | Thread id (default `default`) |
| `message`         | TEXT (JSON) | Full UI message               |
| `created_at`      | TEXT        | ISO timestamp                 |

**Retention: configurable (`chat.retentionDays`, default 30 days).**
`listConversations` prunes older threads.

### `settings` — key/value preferences

| Column       | Type        | Notes                                  |
| ------------ | ----------- | -------------------------------------- |
| `key`        | TEXT PK     | `ui` holds theme, density and language |
| `value`      | TEXT (JSON) | Preference object                      |
| `updated_at` | TEXT        | ISO timestamp                          |

### Business tables

Populated by the corresponding integrations (none connected by default).

| Table       | Fields                                                                          |
| ----------- | ------------------------------------------------------------------------------- |
| `deals`     | `company`, `stage`, `value`, `owner`, `days_in_stage`, `close_date`, `status`   |
| `invoices`  | `client`, `amount`, `due_date`, `status`, `reminders`                           |
| `campaigns` | `channel`, `spend_7d`, `conversions_7d`, `cpa_target`, `daily_budget`, `status` |
| `accounts`  | `mrr`, `usage_trend`, `open_tickets`, `churn_risk`                              |

## 3. No users, roles or RLS

The edition is single-owner, so there are no `profiles`, `user_roles`,
`expert_access` or `invitations` tables, and no row-level security. The audit
log and revert are kept because they are useful locally.

## 4. References

- [Architecture](./02-architecture.md) — layers.
- [Security & access](./04-security.md) — secrets and isolation.
