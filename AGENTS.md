## OpenExpert architecture

- Full prose documentation lives in `docs/` (bilingual: `docs/en/` is the source of truth, `docs/es/` mirrors it) — read `docs/README.md` first. This file is the condensed version plus the gotchas that cost real time; keep both in sync when behaviour changes.
- **Local-first, single owner.** No cloud, no Supabase, no Vercel, no login. The only "external" pieces are optional: Google Drive (OAuth) and the model provider (Ollama, Gemini free key or BYOK).
- **Data lives in SQLite** (`sql.js`) at `OPENEXPERT_DATA_DIR/openexpert.db` (default `~/.openexpert/`). The typed schema is `drizzle/schema.ts`; the baseline DDL is `drizzle/init.sql` and incremental changes live in `drizzle/migrations/NNNN_*.sql` (tracked by `PRAGMA user_version`, applied at startup by `src/lib/db.server.ts`). Always `await persist()` after a write (atomic tmp + rename).
- **Business data is not seeded.** `deals`/`invoices`/`campaigns`/`accounts` start empty and are only filled by a real connector (roadmap) or an import; migration `0004` clears the old fixtures. Business tools report provenance (`connected`) and never present local data as real.
- All reads/writes go through server functions in `src/lib/data.functions.ts` and the business core `src/lib/ee.server.ts`. There is no RLS: authorization is single-owner.
- Every revertible change logs an `activity` row whose `snapshot.entries` holds before-rows; revert replays them. Revertible: `experts`, `integrations`, `invoices`, `campaigns` (`REVERTIBLE` in `ee.server.ts`). Experts are created, edited and deleted from the UI; deleting clears its conversations (conversations are not revertible).
- Autonomous processes were removed (they were mocks: "running" only bumped a counter and there was no scheduler). Rebuild them for real per the roadmap; migration `0005` drops the table.
- AI chat streams from `/api/chat`; prompt-injection is blocked by a regex gate (`src/lib/ai/injection.ts`) before the model runs; tools enforce per-Expert domain isolation from the explicit `experts.domains` list (`ventas`/`finanzas`/`marketing`/`clientes`, added by migration `0002`), not RBAC. Actions are only _proposed_ (`propose_*`) and require human approval.
- Model is configuration, not code: `src/lib/opencore/model-provider.server.ts` (`google | ollama | openai-compatible`; `OPENEXPERT_MODEL_PROVIDER/ID`, `GOOGLE_API_KEY`, `OLLAMA_BASE_URL`, `OPENEXPERT_BASE_URL`+`OPENEXPERT_MODEL_KEY`). The selection logic lives in `@openexpert/opencore`.
- Configuration sources: `openexpert.json` (provider, model, `ai`/`chat` options) + `~/.openexpert/secrets.json` (0600, API keys) + env vars + the `settings` table for UI prefs. Precedence: real env > `openexpert.json` > `secrets.json` > defaults. `src/lib/config.server.ts` loads both files into `process.env` at startup; the `/settings` panel (`src/lib/settings.functions.ts`) writes the files and mirrors changes at runtime. `openexpert.schema.json` and `@openexpert/opencore/config` describe the file.
- Google Drive is optional per-install OAuth. OpenExpert ships with a
  **distributor-baked shared client** using the non-sensitive `drive.file`
  scope and PKCE; the user selects files through the Google Picker.
  Tokens live AES-256-GCM encrypted in `~/.openexpert/credentials.json`
  (`0600`); the Picker grants live in `~/.openexpert/drive-grants.json`.
  Callback: `src/routes/auth.google.callback.ts`. Server fns:
  `startDriveAuth`, `getDriveStatus`, `getGrantedFiles`,
  `setGrantedFiles`, `acceptDriveConsent`, `getClientConfig`. Before
  distributing, the distributor must publish a privacy policy
  ([`PRIVACY.md`](./PRIVACY.md) is the template) and register its URL via
  `OPENEXPERT_PRIVACY_URL`.
- Local folders are an optional source (`local`): the local server browses directories and reads/writes files **only** inside the folders the user granted, resolved with `realpath` against the roots (`~/.openexpert/local-roots.json`, AES-256-GCM encrypted). Picker is a built-in folder navigator plus a typed path; writes (`create_local_file`/`update_local_file`) require human approval. Engine in `src/lib/local-fs.server.ts`; text/PDF/Office (docx/xlsx/pptx) extraction is shared with Drive in `src/lib/office.server.ts`.
- Deployment is `node .output/server/index.mjs` (Nitro `node-server`) or Docker. There is no Vercel preset.
- **Desktop shell (Linux).** `src-tauri/` is a Tauri 2 app whose only job is to render the local server in a native WebKitGTK window; all logic stays in the web app. It is launched by the `openexpert desktop` CLI command (`packages/opencore/src/cli/desktop.ts`), which starts/reuses the Node server and stops it when the window closes. `scripts/install-desktop.mjs` installs a per-user `openexpert` launcher, `.desktop` entry and icon; `scripts/uninstall-desktop.mjs` removes them.
- npm is the package manager; there is no bun lockfile.
- `packages/opencore/` is the shared MIT engine: `model-provider`, `config`, `storage`/`secrets` interfaces, tool catalog and the `opencore` CLI (`src/cli/`). The app imports `@openexpert/opencore/model-provider`.
- Never commit `.env`, `openexpert.json`, `~/.openexpert/`, `credentials.json`,
  `drive-grants.json`, `secret.key`, `state-secret` or `secrets.json`.

## Documentation

- `docs/` is the prose documentation: English under `docs/en/` (source of truth) and Spanish under `docs/es/`, covering product, architecture/data/security/AI, development, deployment, operations, licensing and a glossary.
- Update the relevant `docs/en/NN-*.md` and its `docs/es/` counterpart **and** this file in the same change as any behaviour change. If the code and the docs disagree, the code is right and the docs are the bug.
- After editing docs, check internal links still resolve and run `npx prettier --write "docs/**/*.md"`.
