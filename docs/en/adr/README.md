# Architecture decision records

Short, immutable notes on the decisions that shape OpenExpert. Each one records
the context, the decision and the consequences, so a contributor does not have
to reverse-engineer them from the code.

| N.º | Decision                                                            |
| --- | ------------------------------------------------------------------- |
| 001 | [SQLite via `sql.js`](./0001-sqlite-sqljs.md)                       |
| 002 | [Single-owner, no authentication](./0002-single-owner.md)           |
| 003 | [Model provider is configuration](./0003-model-provider-config.md)  |
| 004 | [Server-side Expert domain isolation](./0004-domain-isolation.md)   |
| 005 | [Schema migrations via `PRAGMA user_version`](./0005-migrations.md) |

ADRs are append-only: to change a decision, add a new record that supersedes the
old one instead of editing it.
