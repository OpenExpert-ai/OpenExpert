# 001 · SQLite via `sql.js`

- **Status:** accepted.
- **Date:** 2025-10 (local-first rewrite).

## Context

OpenExpert runs on the user's machine with no database server and no native
build step. We needed a portable, single-file store that works on any Node
version and ships inside a Docker image and a Tauri app.

## Decision

Use SQLite through `sql.js` (SQLite compiled to WebAssembly), typed with Drizzle
ORM. The database is one file at `OPENEXPERT_DATA_DIR/openexpert.db`; writes are
flushed with `persist()`.

## Consequences

- No native compilation, no `better-sqlite3` ABI issues; works everywhere Node
  runs.
- The whole database lives in memory, so every write re-serialises the file — we
  write it atomically (`.tmp` + `rename`).
- Single process only: two servers pointed at the same file would clobber each
  other. Acceptable for a single-owner local app.
