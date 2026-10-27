# 03 · Data model

> **Audience:** engineering + business. The database is a single local SQLite file.

---

## 1. Overview

One SQLite file at `OPENEXPERT_DATA_DIR/openexpert.db` (default
`~/.openexpert/`). The typed schema is `drizzle/schema.ts`; the baseline DDL is
`drizzle/init.sql` and incremental migrations live in `drizzle/migrations/`
(applied at startup by `src/lib/db.server.ts`). JSON columns are stored as
`TEXT`.

Tables: `experts`, `integrations`, `activity`, `chat_messages`, `deals`,
`invoices`, `campaigns`, `accounts`, `settings`.

On first run `src/lib/db.server.ts` seeds the **configuration** (Experts,
integrations). The business tables (`deals`, `invoices`, `campaigns`,
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

### `integrations` — connector catalogue

| Column             | Type        | Notes                                                      |
| ------------------ | ----------- | ---------------------------------------------------------- |
| `id`               | TEXT PK     | `gdrive`, `pipedrive`, …                                   |
| `name`, `category` | TEXT        | —                                                          |
| `connected`        | INTEGER     | 0/1; `gdrive`, `local` and `notion` can be connected today |
| `entities`         | TEXT (JSON) | `[{ name, count }]` from the last sync                     |
| `last_sync`        | TEXT        | ISO timestamp or null                                      |

### `activity` — audit log

| Column        | Type        | Notes                                                          |
| ------------- | ----------- | -------------------------------------------------------------- |
| `id`          | TEXT PK     | `evt_` + 8 chars                                               |
| `ts`          | TEXT        | ISO timestamp                                                  |
| `actor`       | TEXT        | `human` or `agent`                                             |
| `actor_name`  | TEXT        | Display name                                                   |
| `type`        | TEXT        | `Configuración`, `Consulta`, `Integración`, `Seguridad`, …     |
| `expert_id`   | TEXT        | Affected Expert                                                |
| `status`      | TEXT        | `ok`, `pending`, `denied`, `failed`, `cancelled`, `reverted`   |
| `summary`     | TEXT        | One-line description                                           |
| `sources`     | TEXT (JSON) | Information sources                                            |
| `duration_ms` | INTEGER     | Measured duration in ms, or null when the action was not timed |
| `snapshot`    | TEXT (JSON) | `{ entries }` (for revert) or `{ pending }`                    |

The log is not served in one piece: `getWorkspace` returns the 300 most recent events plus the real
total (`activityTotal`, a `COUNT(*)`), and `getActivityPage` pages backwards with `offset`, so the
oldest event —and its snapshot, which is what the revert button needs— stays reachable from the
panel. The cut used to be silent: the screen printed the size of the window as if it were the total.

The log has no retention, so the list reaches back years. The timestamp of a row therefore writes the
year whenever it is not the current one (`formatDateTime` in `src/lib/format.ts`): "15 jun, 10:30" is
this year's, "15 jun 2025, 10:30" is not. The year is read from the local calendar —the one
`toLocaleString` prints with— so an event on 31 December at 23:30 in Madrid belongs to the year the
clock there says. The list of conversations uses the same formatter.

### `chat_messages` — conversations

| Column            | Type        | Notes                         |
| ----------------- | ----------- | ----------------------------- |
| `id`              | TEXT PK     | UUID                          |
| `expert_id`       | TEXT        | Expert of the conversation    |
| `conversation_id` | TEXT        | Thread id (default `default`) |
| `message`         | TEXT (JSON) | Full UI message               |
| `created_at`      | TEXT        | ISO timestamp                 |

**Retention: configurable (`chat.retentionDays`, default 30 days; `0` disables it).**
`listConversations` prunes threads older than the window across **every Expert**, not only the one
whose list is being opened; with `0` it deletes nothing.

Each row is one full UI message and is identified by the `id` it carries inside
(`message.id`), not by the table key: a turn that continues —approving a write, for
instance— sends that message back with the decision and the result, so the **row is
updated** rather than duplicated. The approval answer (`approval.approved`) and the
tool's outcome live in that `message`, which is what keeps the card from coming back on
reload and the write from running twice.

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

`due_date` holds a plain calendar day (`2026-09-01`), not an instant. The days
an invoice has been late are counted on the calendar, in the local timezone
(`src/lib/calendar-day.ts`): the moment a debt has been running is a number of
days, and the hour of the day does not change it. A date that cannot be read,
or one that has not come yet, counts as zero days — how long a debt has been
running is never negative and never unknown.

An invoice counts as overdue when its `due_date` has passed and it is neither
`paid` nor `cancelled`, whatever the stored `status` says: the CSV importer and
the Holded connector write `open`, so `overdue` only shows up when somebody marks
it by hand, and it is still honoured as it is.

## 3. No users, roles or RLS

The edition is single-owner, so there are no `profiles`, `user_roles`,
`expert_access` or `invitations` tables, and no row-level security. The audit
log and revert are kept because they are useful locally.

## 4. References

- [Architecture](./02-architecture.md) — layers.
- [Security & access](./04-security.md) — secrets and isolation.
