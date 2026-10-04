## OpenExpert architecture

- Full prose documentation lives in `docs/` (bilingual: `docs/en/` is the source of truth, `docs/es/` mirrors it) — read `docs/README.md` first. This file is the condensed version plus the gotchas that cost real time; keep both in sync when behaviour changes.
- **Local-first, single owner.** No cloud, no Supabase, no Vercel, no login. The only "external" pieces are optional: Google Drive (OAuth) and the model provider (Ollama, Gemini free key or BYOK).
- **Data lives in SQLite** (`sql.js`) at `OPENEXPERT_DATA_DIR/openexpert.db` (default `~/.openexpert/`). The typed schema is `drizzle/schema.ts`; the DDL is `drizzle/init.sql` (keep them in sync); `src/lib/db.server.ts` opens the file, applies the DDL at startup and seeds example data. Always `await persist()` after a write.
- All reads/writes go through server functions in `src/lib/data.functions.ts` and the business core `src/lib/ee.server.ts`. There is no RLS: authorization is single-owner.
- Every revertible change logs an `activity` row whose `snapshot.entries` holds before-rows; revert replays them. Revertible: `experts`, `integrations`, `processes`, `invoices`, `campaigns` (`REVERTIBLE` in `ee.server.ts`).
- AI chat streams from `/api/chat`; prompt-injection is blocked by a regex gate (`src/lib/ai/injection.ts`) before the model runs; tools enforce per-Expert domain isolation (ventas/finanzas/marketing/general), not RBAC. Actions are only _proposed_ (`propose_*` / `request_process_run`) and require human approval.
- Model is configuration, not code: `src/lib/opencore/model-provider.server.ts` (`google | ollama | openai-compatible`; `OPENEXPERT_MODEL_PROVIDER/ID`, `GOOGLE_API_KEY`, `OLLAMA_BASE_URL`, `OPENEXPERT_BASE_URL`+`OPENEXPERT_MODEL_KEY`). The selection logic lives in `@openexpert/opencore`.
- Google Drive is optional per-install OAuth. Tokens live in `~/.openexpert/credentials.json` (0600); the OAuth `state` is HMAC-signed. Callback route: `src/routes/auth.google.callback.ts`. All `drive.server.ts` functions use the single owner's token.
- Deployment is `node .output/server/index.mjs` (Nitro `node-server`) or Docker. There is no Vercel preset.
- **Desktop shell (Linux).** `src-tauri/` is a Tauri 2 app whose only job is to render the local server in a native WebKitGTK window; all logic stays in the web app. It is launched by the `openexpert desktop` CLI command (`packages/opencore/src/cli/desktop.ts`), which starts/reuses the Node server and stops it when the window closes. `scripts/install-desktop.mjs` installs a per-user `OpenExpert` launcher, `.desktop` entry and icon; `scripts/uninstall-desktop.mjs` removes them.
- npm is the package manager; there is no bun lockfile.
- `packages/opencore/` is the shared MIT engine: `model-provider`, `config`, `storage`/`secrets` interfaces, tool catalog and the `opencore` CLI (`src/cli/`). The app imports `@openexpert/opencore/model-provider`.
- Never commit `.env`, `openexpert.json`, `~/.openexpert/`, `credentials.json` or `secrets.json`.

## Documentation

- `docs/` is the prose documentation: English under `docs/en/` (source of truth) and Spanish under `docs/es/`, covering product, architecture/data/security/AI, development, deployment, operations, licensing and a glossary.
- Update the relevant `docs/en/NN-*.md` and its `docs/es/` counterpart **and** this file in the same change as any behaviour change. If the code and the docs disagree, the code is right and the docs are the bug.
- After editing docs, check internal links still resolve and run `npx prettier --write "docs/**/*.md"`.
