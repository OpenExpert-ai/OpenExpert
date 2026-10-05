# Changelog

OpenExpert follows [Semantic Versioning](https://semver.org/) and uses
[Changesets](https://github.com/changesets/changesets) to draft release
notes. This file aggregates published releases for readers who do not want
to read every changeset.

## Unreleased

### Local-first rewrite (breaking)

- Removed **Supabase** (database and authentication) and **Vercel** entirely.
  The application is now single-owner and local-only: no login, no cloud.
- Persistence moved to **SQLite** (`sql.js` + Drizzle ORM) in a single file at
  `OPENEXPERT_DATA_DIR/openexpert.db`; schema in `drizzle/schema.ts` + `init.sql`.
- Removed multi-user features: `profiles`, `user_roles`, `expert_access`,
  `invitations`, the users screen and the login routes.
- Model providers are `ollama`, `google` and `openai-compatible`; the
  `openexpert` gateway provider is gone.
- Nitro preset is always `node-server`; run locally or with Docker.
- `@openexpert/opencore` simplified to match (no mode/gateway/auth modules).
- Documentation and `AGENTS.md` rewritten for the local edition.

### Added

- **MIT license for the entire repository**: code, docs and the OpenCore
  engine.
- **`@openexpert/opencore`** with a build step (`tsup`), generated types, a
  JSON schema for `openexpert.json`, and a CLI (`init`, `doctor`, `fix`,
  `models`, `serve`, `update`).
- **`create-openexpert`** (`npm create openexpert`) to scaffold a project.
- **Desktop app (Linux)** via Tauri: the `openexpert` command starts the local
  server and opens a native window.
- **Settings panel** (`/settings`): model & AI, chat, data & backups,
  appearance and advanced options, in Spanish or English.
- **Example business data** seeded on first run (`deals`, `invoices`,
  `campaigns`, `accounts`) so the assistant has something to answer with.
- **Bilingual documentation** in `docs/en/` (primary) and `docs/es/`.
- **Continuous integration** (lint, format, licence headers, documentation
  links, typecheck, tests, build) and Docker images on GHCR.
- **Zero-config Docker Compose** (app + Ollama) and a five-minute quickstart.

### Changed

- `package.json` declares `workspaces`, `engines` and `packageManager`.
- The chat settings no longer expose the unused "default approval" option.

### Fixed

- Reverting a process no longer drops its metadata: a snapshot now restores
  only the captured columns instead of replacing the whole row.
- `OLLAMA_BASE_URL` accepts either the native root (`http://localhost:11434`)
  or the `/v1` endpoint for both chat and model listing.
- Docker healthchecks point at `/` and no longer rely on `wget`, which the
  runtime image does not ship.
- Backup downloads reject cross-origin requests.

### Security

- `.env`, `openexpert.json`, `~/.openexpert/`, `credentials.json` and
  `secrets.json` remain git-ignored and are never committed.
- `GET /api/backup` embeds credentials, so it now rejects cross-origin
  requests; the security guide documents this and the on-demand key reveal.
