# 005 · Schema migrations via `PRAGMA user_version`

- **Status:** accepted.
- **Date:** 2026-10.

## Context

The baseline DDL (`drizzle/init.sql`) is applied idempotently with
`CREATE TABLE IF NOT EXISTS`, so column or index additions never reached
databases created by an older version.

## Decision

Add a light migration runner in `src/lib/db.server.ts`. `init.sql` stays the
baseline; every change for existing databases is a numbered
`drizzle/migrations/NNNN_*.sql`. The runner applies files whose number is
greater than `PRAGMA user_version` and bumps the version.

## Consequences

- Old and new databases converge at startup; no external migration tool or
  native dependency.
- Contributors must add a numbered migration for every schema change (documented
  in `docs/en/07-development.md` and `AGENTS.md`).
- More complex changes (dropping/renaming columns on SQLite) still need a
  table-rebuild migration, written by hand.
