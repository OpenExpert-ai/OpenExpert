## OpenExpert architecture

- Full prose documentation lives in `docs/` (bilingual: `docs/en/` is the source of truth, `docs/es/` mirrors it) — read `docs/README.md` first. This file is the condensed version plus the gotchas that cost real time; keep both in sync when behaviour changes.
- All mutations go through `src/lib/data.functions.ts` server fns that check role/access via `ee.server.ts` and write with the admin client; RLS grants members read-only so privilege checks live in one place.
- Every revertible change logs an `activity` row whose `snapshot.entries` holds before-rows; revert replays them. Pending human-approval actions store `snapshot.pending`. Only `experts`, `expert_access`, `user_roles`, `integrations`, `processes`, `invoices`, `campaigns` and `invitations` are revertible (`REVERTIBLE` in `ee.server.ts`).
- AI chat streams from `/api/chat` (bearer token verified server-side); prompt-injection is blocked by a regex gate before the model runs; tools enforce Expert context isolation.
- First signed-up user becomes ADMIN; invited emails get their role via the `handle_new_user` trigger.
- Access: owner email or invited emails only, Google-only, enforced in the `handle_new_user` trigger; app requires a profile row (created only by that trigger). The trigger reads the owner email from the Postgres setting `app.owner_email` (fallback `owner@example.com`), so no personal address is committed. `ALLOWED_EMAIL` in `ee.server.ts` (from the `ALLOWED_EMAIL` env var) is **documentation, not enforcement**.
- The only Expert model is `experts` / `expert_access` / `expert_id`: migration `0010` dropped the previous model (legacy tables, columns, mirror triggers and sync function are gone). Never reference the old names in new code or SQL.

## OpenCore (local, MIT)

- `packages/opencore/` is the downloadable MIT core: mode, config, model-provider, storage/token interfaces, tool catalog, CLI `bin/opencore.js`. Cloud-only stuff (multi-user billing/SSO/hosting) stays out.
- `OPENEXPERT_MODE=local` = single owner `local-owner` (ADMIN, no login), file storage in `OPENEXPERT_DATA_DIR` (`~/.openexpert/*.json` + `credentials.json` 0600), in-memory default expert if Supabase is absent. Cloud path is unchanged.
- Model is configuration, not code: `src/lib/opencore/model-provider.server.ts` (`google | ollama | openai-compatible | openexpert`, `OPENEXPERT_MODEL_PROVIDER/ID`, `OLLAMA_BASE_URL`/`OPENEXPERT_BASE_URL`+`OPENEXPERT_MODEL_KEY`, and `OPENEXPERT_GATEWAY_URL`+`OPENEXPERT_API_KEY` for the hosted gateway). Chat uses `getLanguageModel()`; `chat.server.ts` falls back to file storage + `logSafe` in local.
- `vite.config.ts` Nitro preset is `node-server` when `OPENEXPERT_MODE=local`, else `vercel`. `npm run dev:local` runs the PC mode; `npm run opencore:doctor` checks it.
- License: the whole repository is MIT (`LICENSE`). Monetisation is the hosted cloud and the OpenExpert model gateway, not the code. Never commit `.env`, `openexpert.json`, `~/.openexpert/`, service_role keys, `GOOGLE_CLIENT_SECRET`, `auth.users`, production project references or owner emails.

## Runtime / deployment

- Standalone app: Supabase project + Vercel. No third-party runtime, gateway or credentials. Production endpoints, project references and OAuth client identifiers are tracked in an **operations document kept outside this repository** and are **never committed** — see `SECURITY.md`.
- `vite.config.ts` is hand-written: Tailwind, TanStack Start, Nitro (build only) and React, plus the `@` alias, React/TanStack dedupe and `strictPort` 3000. Don't reintroduce a wrapper package that assembles it.
- npm is the package manager; there is no bun lockfile — don't reintroduce one.
- The folder is initialized as a git repository; add the remote (`git remote add origin <url>`) before pushing. The production deployment does not depend on the remote being configured.
- Supabase MCP is wired in `~/.config/opencode/opencode.json` under `mcp.servers.supabase`. Use it for schema/data work instead of guessing.
- Secrets live in `.env` locally and in Vercel env vars in production. `.env` stays ignored by git; `.env.example` documents every var.
- Database changes: the schema in Postgres is driven by **hand-written SQL** files in `drizzle/migrations/` (`drizzle/schema.ts` is intentionally blank — this repo uses Drizzle only as a migration runner). Add the next `000N_*.sql`, add the matching entry to `drizzle/migrations/meta/_journal.json`, then run `npm run db:migrate` (needs `DATABASE_URL`). Do **not** run `db:generate` — it would emit empty migrations. The `sha256` of each `.sql` must match the `hash` column in `drizzle.__drizzle_migrations`, or `db:migrate` aborts.
- Dev server is pinned to **port 3000 with `strictPort`**. The OAuth redirect URIs depend on it; don't let it drift.

## Auth (Supabase)

- Google is the **only** enabled provider (`external_google_enabled: true`); email/password is off (`external_email_enabled: false`). The app also redirects back to `<origin>/auth`, so `uri_allow_list` must allow the app root — not `/auth/callback`.
- One Google OAuth client serves both login and Drive, but each flow has its own redirect URI, and **both families must be registered** in the client or Google returns `redirect_uri_mismatch` and login is dead:
  - login → `<project-ref>.supabase.co/auth/v1/callback` (owned by Supabase, same in every environment — this one is required). Resolve the host from `SUPABASE_URL`.
  - Drive → `<origin>/auth/google/callback` (owned by the app, so it changes per host)
- `site_url` and `uri_allow_list` point at `localhost:3000`; update **both** when the Vercel domain exists, or login silently bounces to localhost.
- OAuth for Drive is separate from the login provider — same client id/secret, different scopes, own consent screen state. Leave that consent screen in **In production**, not Testing: in Testing Google caps the Drive refresh token at 7 days.
- `auth.users` rows must never have NULL in `confirmation_token`, `recovery_token`, `email_change_token_current`, `email_change_token_new` or `email_change` — GoTrue scans them as non-nullable strings and returns 500 instead of 401. Migration `0008` enforces it with a trigger; if you insert users with `session_replication_role = replica` (which skips triggers), write `''` yourself.

## Google Drive

- Drive is per-user OAuth implemented in `src/lib/drive-tokens.server.ts` (authorization URL, HMAC-signed `state`, token exchange, refresh, disconnect). Callback route: `src/routes/auth.google.callback.ts`.
- Tokens live in `public.google_tokens` — RLS on, **no** user policies, service_role only. Don't add an authenticated policy.
- All `drive.server.ts` functions take a `userId` first; never use a shared/ambient Drive credential.

## Errors

- `reportAppError()` from `src/lib/error-reporting.ts` logs client-side failures. Don't reintroduce vendor-branded error reporting or crash reporters.

## Documentation

- `docs/` is the prose documentation: English under `docs/en/` (source of truth) and Spanish under `docs/es/`, covering product, architecture/data/security/AI, development, deployment, operations, licensing and a glossary.
- Update the relevant `docs/en/NN-*.md` and its `docs/es/` counterpart **and** this file in the same change as any behaviour change. If the code and the docs disagree, the code is right and the docs are the bug.
- After editing docs, check internal links still resolve and run `npx prettier --write "docs/**/*.md"`.
