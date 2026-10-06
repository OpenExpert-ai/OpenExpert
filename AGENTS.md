# OpenExpert — Agent Guide

Condensed operating rules for AI assistants working on this repository. The full
prose documentation lives in `docs/` (bilingual: `docs/en/` is the source of
truth, `docs/es/` mirrors it) — read `docs/README.md` first. Keep this file, the
docs and the code in sync when behaviour changes. If the code and the docs
disagree, the code is right and the docs are the bug.

## 1. What OpenExpert is

- **Local-first, single-owner** operations dashboard with an AI assistant. No
  cloud, no Supabase, no Vercel, no login, no database server.
- The only "external" pieces are optional: **sources** (Google Drive, local
  folders, Notion) and the **model provider** (Ollama, Gemini free key or BYOK).
- Stack: TanStack Start (React 19, file routes, SSR) + Vite, Tailwind CSS 4 +
  shadcn/ui, Tailwind-styled components, Nitro (`node-server`) as runtime, and
  SQLite via `sql.js` + Drizzle ORM.
- Node.js ≥ 24 and npm ≥ 11 are required; npm is the package manager (there is
  no bun lockfile).

## 2. Data and persistence

- SQLite at `OPENEXPERT_DATA_DIR/openexpert.db` (default `~/.openexpert/`).
- Typed schema: `drizzle/schema.ts`. Baseline DDL: `drizzle/init.sql`.
  Incremental changes: `drizzle/migrations/NNNN_*.sql`, tracked by
  `PRAGMA user_version` and applied at startup by `src/lib/db.server.ts`.
- Always `await persist()` after a write: it writes the file atomically
  (`.tmp` + `rename`).
- Tables: `experts`, `integrations`, `activity`, `chat_messages`, `deals`,
  `invoices`, `campaigns`, `accounts`, `settings`.
- **Business data is not seeded.** `deals`/`invoices`/`campaigns`/`accounts`
  start empty and are only filled by a real connector (roadmap) or an import;
  migration `0004` clears the old fixtures. Only the configuration (Experts,
  integrations) is seeded. Business tools report provenance (`connected`) and
  never present local data as real.
- Schema changes: keep `schema.ts` and `init.sql` in sync for fresh installs and
  add a numbered migration for existing databases.

## 3. Code paths and rules

- All reads and writes go through server functions: `src/lib/data.functions.ts`
  (workspace) and `src/lib/settings.functions.ts` (settings). The business core
  is `src/lib/ee.server.ts`.
- There is **no RLS**: authorization is single-owner and lives in code.
- `.server.ts` modules are server-only and never reach the browser.
- Every revertible change logs an `activity` row whose `snapshot.entries` holds
  the before-rows; revert replays them. Revertible tables are defined by
  `REVERTIBLE` in `src/lib/ee.server.ts`: `experts`, `integrations`,
  `invoices`, `campaigns`. Experts are created, edited and deleted from the UI;
  deleting an Expert clears its conversations (conversations are not
  revertible).
- File-based routes live in `src/routes/`; `routeTree.gen.ts` is generated.
- Validation at the edge with Zod; user-facing messages in Spanish; no implicit
  `any`; format with Prettier.

## 4. AI chat and tools

- Chat streams from `POST /api/chat` (`src/routes/api/chat.ts`,
  `src/lib/ai/chat.server.ts`).
- Prompt injection is blocked by a regex gate (`src/lib/ai/injection.ts`) before
  the model runs, and the attempt is logged with status `denied`.
- Tools are defined in `src/lib/ai/tools.ts`. Tools enforce **per-Expert domain
  isolation** from the explicit `experts.domains` list
  (`ventas`/`finanzas`/`marketing`/`clientes`, see `src/lib/domains.ts`);
  migration `0002` adds the column and `0006` renames the `general` domain to
  `clientes`.
- The assistant has no direct database access: reads go through tools; write
  actions are only _proposed_ (`propose_*`) and require explicit human approval.
- The assistant always answers in **Spanish**; the interface is bilingual
  (Spanish/English).
- Autonomous processes were removed (they were mocks: "running" only bumped a
  counter and there was no scheduler). Migration `0005` drops the table; rebuild
  them for real per the roadmap.

## 5. Model provider: configuration, not code

- Selection lives in `src/lib/opencore/model-provider.server.ts` and the shared
  `@openexpert/opencore` engine (`selectModel` / `missingKeyHint`).
- Providers: `ollama` (default, local), `google` (Gemini free key),
  `openai-compatible` (BYOK).
- Environment variables: `OPENEXPERT_MODEL_PROVIDER`, `OPENEXPERT_MODEL_ID`,
  `GOOGLE_API_KEY`, `OLLAMA_BASE_URL`, `OPENEXPERT_BASE_URL` +
  `OPENEXPERT_MODEL_KEY`.
- Configuration sources: `openexpert.json` (provider, model, `ai`/`chat`
  options) plus `~/.openexpert/secrets.json` (`0600`, API keys) plus env vars
  plus the `settings` table for UI preferences. **Precedence: real env >
  `openexpert.json` > `secrets.json` > defaults.**
- `src/lib/config.server.ts` loads both files into `process.env` at startup; the
  `/settings` panel (`src/lib/settings.functions.ts`) writes the files and
  mirrors changes at runtime, so changes take effect without a restart.
- The file schema is `packages/opencore/schema/openexpert.schema.json`
  (`@openexpert/opencore/config`).
- Interface language (Spanish/English) is a `settings` preference; the client
  layer is `src/lib/i18n.tsx` with the English dictionary in
  `src/locales/en.ts` (Spanish is the source language).

## 6. Sources (all optional)

### Google Drive (`gdrive`)

- Uses the non-sensitive `drive.file` scope (per-file, no CASA) with PKCE; the
  user selects files through the Google Picker.
- Tokens live AES-256-GCM encrypted in `~/.openexpert/credentials.json`
  (`0600`); the Picker grants live in `~/.openexpert/drive-grants.json`.
- Client credentials: `OPENEXPERT_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`; Picker: `GOOGLE_PICKER_API_KEY`,
  `GOOGLE_PICKER_APP_ID`. Redirect URI:
  `http://localhost:3000/auth/google/callback`.
- OAuth `state` is HMAC-signed with `GOOGLE_OAUTH_STATE_SECRET` (or a generated
  `~/.openexpert/state-secret`). The privacy-policy link shown before
  connecting can be overridden with `OPENEXPERT_PRIVACY_URL`
  ([`PRIVACY.md`](./PRIVACY.md) is canonical).
- Callback: `src/routes/auth.google.callback.ts`. Server fns: `startDriveAuth`,
  `getDriveStatus`, `getGrantedFiles`, `setGrantedFiles`, `acceptDriveConsent`,
  `getClientConfig`. Engine: `src/lib/drive.server.ts`,
  `src/lib/drive-tokens.server.ts`.

### Local folders (`local`)

- The local server browses directories and reads/writes files **only** inside the
  folders the user granted, resolved with `realpath` against the roots.
- Grants live AES-256-GCM encrypted in `~/.openexpert/local-roots.json`.
- The picker is a built-in folder navigator plus a typed absolute path; writes
  (`create_local_file`/`update_local_file`) require human approval.
- Engine: `src/lib/local-fs.server.ts`. Server fns: `getLocalRoots`,
  `browseLocalDir`, `addLocalRoot`, `removeLocalRoot`.

### Notion (`notion`)

- Connected with **OAuth 2.0**; the user clicks Connect and picks pages in
  Notion's own picker. Client id: `notionClientId` in `openexpert.json` or
  `OPENEXPERT_NOTION_CLIENT_ID` / `NOTION_CLIENT_ID`; secret:
  `NOTION_CLIENT_SECRET` in `secrets.json`/env.
- The long-lived token is AES-256-GCM encrypted in `~/.openexpert/notion.json`
  (`0600`); its `state` is HMAC-signed with
  `~/.openexpert/state-secret-notion`. Notion has no refresh token.
- API version pinned with the `Notion-Version` header (`2026-03-11`); the rate
  limit is ~3 requests/second and `Retry-After` is respected.
- Callback: `src/routes/auth.notion.callback.ts`. Server fns:
  `getNotionStatus`, `startNotionAuth`, `disconnectNotion`. Client:
  `src/lib/notion.server.ts`, OAuth: `src/lib/notion-tokens.server.ts`.

Text/PDF/Office (`.docx`/`.xlsx`/`.pptx`, OpenDocument) extraction is shared by
Drive and local folders in `src/lib/office.server.ts`.

## 7. Deployment and desktop

- Production runtime: `node .output/server/index.mjs` (Nitro `node-server`) or
  Docker. There is no Vercel preset. Port 3000 is pinned because the Drive OAuth
  redirect URI depends on it.
- Backup (`GET /api/backup`, `src/lib/backup.server.ts`) bundles the database
  plus `openexpert.json`, `secrets.json` and `credentials.json`; restoring
  replaces the current data.
- **Desktop shell (Linux).** `src-tauri/` is a Tauri 2 app whose only job is to
  render the local server in a native WebKitGTK window; all logic stays in the
  web app. It is launched by the `openexpert desktop` CLI command
  (`packages/opencore/src/cli/desktop.ts`), which starts/reuses the Node server
  and stops it when the window closes. `scripts/install-desktop.mjs` installs a
  per-user `openexpert` launcher, `.desktop` entry and icon;
  `scripts/uninstall-desktop.mjs` removes them.

## 8. Repository layout and tooling

- `packages/opencore/` is the shared MIT engine: `model-provider`, `config`,
  `storage`/`secrets` interfaces, the tool catalog and the `opencore` CLI
  (`src/cli/`). The app imports `@openexpert/opencore/model-provider`.
- Scripts: `dev`, `build`, `preview`, `lint`/`lint:fix`, `format`/`format:check`,
  `typecheck`, `test:run`, `test:coverage`, `opencore:doctor`, `opencore:serve`,
  `desktop:install`/`desktop:uninstall`, `license:check`, `check:docs`,
  `check:commits`.
- Pre-flight before shipping a change: `npm run typecheck`, `npm run lint`,
  `npm run test:run`, `npm run build`.
- Releases are managed with Changesets (`.changeset/`); add a short note
  describing user-visible changes.

## 9. Never commit secrets

`.env`, `openexpert.json`, `~/.openexpert/`, `credentials.json`,
`drive-grants.json`, `local-roots.json`, `notion.json`, `secret.key`,
`state-secret` and `secrets.json` are git-ignored and must never be committed.

## 10. Documentation

- `docs/` is the prose documentation: English under `docs/en/` (source of truth)
  and Spanish under `docs/es/`, covering product, architecture/data/security/AI,
  development, deployment, operations, licensing, AI providers, a glossary and
  the architecture decision records (`docs/{en,es}/adr/`).
- Update the relevant `docs/en/NN-*.md`, its `docs/es/` counterpart **and** this
  file in the same change as any behaviour change.
- After editing docs, run `npx prettier --write "docs/**/*.md"` and check that
  internal links and anchors still resolve (`npm run check:docs`).
