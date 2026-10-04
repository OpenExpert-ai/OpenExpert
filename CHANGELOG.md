# Changelog

OpenExpert follows [Semantic Versioning](https://semver.org/) and uses
[Changesets](https://github.com/changesets/changesets) to draft release
notes. This file aggregates published releases for readers who do not want
to read every changeset.

## Unreleased

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
