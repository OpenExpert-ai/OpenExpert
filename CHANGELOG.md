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
  `openexpert` gateway provider is gone. New AI providers guide (EN/ES).
- Nitro preset is always `node-server`; run locally or with Docker.
- `@openexpert/opencore` simplified to match (no mode/gateway/auth modules).
- Documentation and `AGENTS.md` rewritten for the local edition.

Initial open-source release of OpenExpert under the MIT license.

### Added

- **MIT license for the entire repository.** The codebase, including the
  cloud application, is distributed under the MIT license. Monetisation is
  the hosted service and the OpenExpert model gateway.
- **Real `@openexpert/opencore` package** with a build step (`tsup`),
  generated types, a JSON schema for `openexpert.json`, a CLI that
  actually boots the local edition (`opencore serve`), and an expanded
  `doctor` command.
- **OpenExpert model gateway** as a fourth model provider
  (`OPENEXPERT_MODEL_PROVIDER=openexpert`). The MIT client points at the
  gateway; the gateway itself is hosted separately.
- **Continuous integration** (`.github/workflows/ci.yml`) running lint,
  typecheck, tests, and build on every pull request.
- **Release automation** via Changesets and npm Trusted Publishing.
- **Docker images** published to GitHub Container Registry for the local
  edition.
- **Bilingual documentation** in `docs/en/` (primary) and `docs/es/`.
- **Governance documents:** `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `GOVERNANCE.md`, and a private reporting channel in `SECURITY.md`.

- **One-command local usage.** The `opencore` CLI is now an interactive
  setup wizard (`npx @openexpert/opencore`) with `doctor`, `fix`,
  `models`, `serve`, and `update`. `serve` boots the local edition from a
  source checkout or from a downloaded server build.
- **Local mode works end-to-end.** The UI no longer requires Supabase in
  `OPENEXPERT_MODE=local`: it seeds example Experts, processes and
  integrations, and shows a first-run checklist.
- **`create-openexpert`** (`npm create openexpert`) scaffolds a local
  project.
- **Zero-config Docker Compose** (app + Ollama) and a 5-minute quickstart
  in `docs/en/00-quickstart.md` and `docs/es/00-inicio-rapido.md`.

### Changed

- `package.json` declares `workspaces`, `engines`, and `packageManager`.
- `getLanguageModel()` returns a properly typed `LanguageModel` instead of
  `any`.
- The production Supabase project reference is no longer hard-coded in
  public documentation.

### Security

- Removed the hard-coded owner email from migrations `0002`, `0006` and
  `0010`: the `handle_new_user` trigger now reads it from the Postgres
  setting `app.owner_email` (fallback `owner@example.com`), so no personal
  address is committed. Existing deployments must re-baseline the stored
  migration hashes.
- Removed the production Supabase project reference from
  `supabase/config.toml`.
- Made the client-side error reporter pluggable through
  `window.__OPENEXPERT_ERROR_REPORTER__` instead of a vendor global.

### Fixed

- CodeQL workflow referenced the non-existent `codeql-action/analyse`
  step (now `analyze`).
- Release workflow read a non-existent Changesets action output
  (`publish` → `published`) and passed an unused build secret.
- Moved the Docker ignore file to the repository root so the build
  context honours it.
- Corrected broken relative links in the English documentation
  (`12-licensing`, `roadmap`) and the Docker Compose volume path.
- Added SPDX headers across first-party sources and wired
  `license:check` into CI.
