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
- `activity.duration_ms` holds a **measured** duration, and it is null for the
  actions that are not timed. Do not fill it with a constant: a number nobody
  measured reads in the audit trail as a real one. The screen shows a dash
  (`formatDuration` in `src/lib/format.ts`) when there is none.
- File-based routes live in `src/routes/`; `routeTree.gen.ts` is generated.
- Validation at the edge with Zod; user-facing messages in Spanish; no implicit
  `any`; format with Prettier.

## 4. AI chat and tools

- Chat streams from `POST /api/chat` (`src/routes/api/chat.ts`,
  `src/lib/ai/chat.server.ts`).
- A step has a hard deadline (`src/lib/ai/deadline.ts`, 4 min, overridable with
  `OPENEXPERT_CHAT_TIMEOUT_MS`): `fetch` has no timeout of its own, so a provider
  that accepts the connection and never answers ends the turn with an error the
  interface shows. The deadline covers the tools of the step, so it outlasts
  `run_python` (120 s).
- Prompt injection is blocked by a regex gate (`src/lib/ai/injection.ts`) before
  the model runs, and the attempt is logged with status `denied`.
- The owner's extra patterns are checked by **measuring their cost**
  (`src/lib/ai/redos.server.ts`), not by their shape: catastrophic backtracking
  does not fail, it freezes the thread that serves the app. The measurement runs
  inside a `vm` context so a pattern that does not come back can be cut off.
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

- The catalogue is `packages/openexpert/src/providers.ts`: a provider is a record
  (adapter, endpoint, key variable, headers, models) and the provider id is
  derived from it. **No two records may share a key variable** and a test
  enforces it, because a shared one means saving a key silently overwrites
  another provider's and the failure only shows up later as a 401.
- Selection lives in `src/lib/engine/model-provider.server.ts` and the shared
  `@openexpert/openexpert` engine (`selectModel` / `missingKeyHint`). Asking a
  provider which models it serves is `listProviderModels`, used by the panel, the
  CLI and `doctor`, so none of them keeps its own version of the question.
- Providers: `ollama` (local), `google` (Gemini free key), `anthropic`,
  `openai-compatible` (BYOK) and `opencode-go`.
- Environment variables: `OPENEXPERT_MODEL_PROVIDER`, `OPENEXPERT_MODEL_ID`,
  `OLLAMA_BASE_URL`, `OPENEXPERT_BASE_URL` (the generic endpoint) and **one key
  per provider**: `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `OPENEXPERT_MODEL_KEY`,
  `OPENCODE_GO_API_KEY`.
- **One name and one version.** The product, the package, the CLI and the release
  are all OpenExpert (`@openexpert/openexpert`, binary `openexpert`, page
  `docs/*/11-*`). `packages/openexpert/package.json` is the only place with a
  version: the root manifest is private and declares `0.0.0`, the interface reads
  the package's through `src/lib/version.ts`, and the desktop shell takes it at
  build time. Releases are tagged `v<version>` and titled `OpenExpert <version>`;
  `release.yml` creates them, because changesets would name them after the package.
  See [ADR 007](./docs/en/adr/0007-one-name-one-version.md).
- Configuration sources: `openexpert.json` (provider, model, `ai`/`chat`
  options) plus `~/.openexpert/secrets.json` (`0600`, API keys) plus env vars
  plus the `settings` table for UI preferences. **Precedence: real env >
  `openexpert.json` > `secrets.json` > defaults.**
- `src/lib/config.server.ts` loads both files into `process.env` at startup; the
  `/settings` panel (`src/lib/settings.functions.ts`) writes the files and
  mirrors changes at runtime, so changes take effect without a restart.
- **Probing is not saving.** "Probar conexión" and "Listar" ask about what the
  form holds (`probePayload` in `src/lib/provider-probe.ts`), and the key they
  carry is used for that question and dropped: it never reaches `secrets.json`.
  Called with nothing, they ask about the stored configuration, which is what
  the CLI's `models` asks.
- The file schema is `packages/openexpert/schema/openexpert.schema.json`
  (`@openexpert/openexpert/config`).
- Interface language (Spanish/English) is a `settings` preference; the client
  layer is `src/lib/i18n.tsx` with the English dictionary in
  `src/locales/en.ts` (Spanish is the source language).

## 6. Sources (all optional)

### Google Drive (`gdrive`)

- Uses the non-sensitive `drive.file` scope (per-file, no CASA) with PKCE; the
  user selects files through the Google Picker.
- Tokens live AES-256-GCM encrypted in `~/.openexpert/credentials.json`
  (`0600`); the Picker grants live in `~/.openexpert/drive-grants.json`.
  Quitar un archivo en Ajustes → Fuentes lo revoca (`revokeGrantedFile`): el id
  sale del fichero y `read_drive_file`/`search_drive` dejan de verlo.
- Client credentials: `OPENEXPERT_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`; Picker: `GOOGLE_PICKER_API_KEY`,
  `GOOGLE_PICKER_APP_ID`. Redirect URI:
  `http://localhost:3000/auth/google/callback`.
- OAuth `state` is HMAC-signed with `GOOGLE_OAUTH_STATE_SECRET` (or a generated
  `~/.openexpert/state-secret`). The privacy-policy link shown before
  connecting can be overridden with `OPENEXPERT_PRIVACY_URL`
  ([`PRIVACY.md`](./PRIVACY.md) is canonical).
- Callback: `src/routes/auth.google.callback.ts`. Server fns: `startDriveAuth`,
  `getDriveStatus`, `getGrantedFiles`, `addGrantedFiles`, `revokeGrantedFile`,
  `acceptDriveConsent`, `getClientConfig`. Engine: `src/lib/drive.server.ts`,
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
  plus `openexpert.json`, `secrets.json` and the credential custody —
  `credentials.json`, `drive-grants.json`, `local-roots.json`, `notion.json`,
  `drive-consent.json` and `secret.key` — so a restore on another machine keeps
  the integrations connected. The key makes the bundle as sensitive as the
  tokens; restoring replaces the current data and reports what the bundle did
  not carry.
- **A restored configuration is validated like a typed one.** The bundle is a
  file that arrives from outside, so `restoreBackup` checks the
  `openexpert.json` it carries with the same schema the panel and the raw
  editor use (`fileConfigSchema`, `checkFileConfig` in
  `src/lib/config.server.ts`) before anything is staged: a configuration the
  application cannot run with is refused whole, with the field and the limit
  it breaks, and the installation keeps the file it had. The limits are the
  billable ones (`chat.maxSteps` at 200 steps, `chat.retentionDays` at 3650
  days, `ai.maxOutputTokens` at 200000 tokens) and the injection patterns are
  measured against an adversarial input, so their number is counted before any
  of them is measured.
- **Desktop shell (Linux).** `src-tauri/` is a Tauri 2 app whose only job is to
  render the local server in a native WebKitGTK window; all logic stays in the
  web app. It is launched by the `openexpert desktop` CLI command
  (`packages/openexpert/src/cli/desktop.ts`), which starts/reuses the Node server
  and stops it when the window closes. `scripts/install-desktop.mjs` installs a
  per-user `openexpert` launcher, `.desktop` entry and icon;
  `scripts/uninstall-desktop.mjs` removes them. `install.sh` delegates in that
  script instead of generating its own copies, and `--doctor` /
  `npm run desktop:check` fail on a launcher whose `exec` target no longer exists.
  The launcher opens the window only with no argument: any subcommand (`doctor`,
  `fix`, `init`, `serve`, `version`) runs the CLI and never starts the GUI.
- **The window follows the port.** The window URL is not the one compiled into
  the binary: `openexpert desktop` exports `OPENEXPERT_DESKTOP_URL` and the shell
  navigates to it (`src-tauri/src/main.rs`), so `PORT=3100 openexpert` opens 3100. `build.frontendDist` is `src-tauri/fallback/` (one page, no web app
  embedded: the server serves it); `bundle.targets` is `all`, so
  `npm run desktop:build` really produces `.deb`/`.rpm`/AppImage.
- **One version, three copies.** `packages/openexpert/package.json` is the source;
  `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and the `openexpert-desktop`
  entry in `src-tauri/Cargo.lock` are written by
  `npm run desktop:sync-version` (`-- --check` verifies them). `version-packages`
  runs it, `install.sh` refuses to build when they diverge and
  `.github/workflows/desktop-gate.yml` reports it. A bump touches all three.
- **No updater.** There is no `tauri-plugin-updater`, no `createUpdaterArtifacts`
  and no key: updating the window means rebuilding and reinstalling it. What is
  missing is listed in `docs/en/08-deployment.md` §5.

## 8. Repository layout and tooling

- `packages/openexpert/` is the shared MIT engine: `model-provider`, `config`,
  `storage`/`secrets` interfaces, the tool catalog and the `openexpert` CLI
  (`src/cli/`). The app imports `@openexpert/openexpert/model-provider`.
- Scripts: `dev`, `build`, `preview`, `lint`/`lint:fix`, `format`/`format:check`,
  `typecheck`, `test:run`, `test:coverage`, `openexpert:doctor`, `openexpert:serve`,
  `desktop:install`/`desktop:uninstall`, `license:check`, `check:docs`,
  `check:commits`.
- Pre-flight before shipping a change: `npm run typecheck`, `npm run lint`,
  `npm run test:run`, `npm run build`.
- Releases are managed with Changesets (`.changeset/`); add a short note
  describing user-visible changes.
- Every change reaches `main` through a pull request (a ruleset blocks direct
  pushes, force pushes and deletion). Workflows are covered in
  `docs/en/07-development.md`: actions pinned to a commit SHA, downloaded tools
  verified against their published checksums, read-only top-level permissions
  (a job-level `permissions:` block replaces the workflow one, so repeat
  `contents: read` where checkout is used).
- The `chore(release): version packages` pull request is opened by
  `changesets/action` with `GITHUB_TOKEN`, so its workflows start as
  **"action_required"**: approve them before trusting the PR's checks.

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
