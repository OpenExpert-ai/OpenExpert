# 07 · Development

> **Audience:** engineering team.

---

## 1. Requirements

| Tool    | Version     |
| ------- | ----------- |
| Node.js | 24 or later |
| npm     | 11 or later |

## 2. Bootstrapping

```sh
npm ci
cp openexpert.json.example openexpert.json   # optional; defaults work
npm run dev                                 # http://localhost:3000
```

In a fresh checkout, `npm ci` also builds `packages/openexpert` (its `prepare`
script), so the CLI is ready.

## 3. Environment variables

Documented in `.env.example`. The essentials:

| Variable                                                                                | Function                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `OPENEXPERT_MODEL_PROVIDER`                                                             | `ollama` \| `google` \| `anthropic` \| `openai-compatible` \| `opencode-go`     |
| `OPENEXPERT_MODEL_ID`                                                                   | Model identifier                                                                |
| `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY` / `OPENCODE_GO_API_KEY` / `OPENEXPERT_MODEL_KEY` | One key per provider: Gemini, Claude, OpenCode Go and your own endpoint         |
| `OPENEXPERT_BASE_URL`                                                                   | Endpoint of `openai-compatible`, which is the only one you provide              |
| `OLLAMA_BASE_URL`                                                                       | Ollama endpoint                                                                 |
| `OPENEXPERT_DATA_DIR`                                                                   | Data directory (default `~/.openexpert/`)                                       |
| `GOOGLE_CLIENT_ID` / `OPENEXPERT_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`             | Drive OAuth (optional)                                                          |
| `GOOGLE_REDIRECT_URI` / `GOOGLE_OAUTH_STATE_SECRET`                                     | Drive OAuth (optional)                                                          |
| `GOOGLE_PICKER_API_KEY` / `GOOGLE_PICKER_APP_ID`                                        | Google Picker: the in-browser Drive file selector                               |
| `PUBLIC_APP_URL`                                                                        | Public origin used to build the Drive redirect URI                              |
| `OPENEXPERT_PRIVACY_URL`                                                                | Privacy-policy URL shown before activating Drive                                |
| `OPENEXPERT_NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET`                                  | Notion OAuth (optional)                                                         |
| `NOTION_REDIRECT_URI` / `NOTION_OAUTH_STATE_SECRET`                                     | Notion OAuth (optional)                                                         |
| `OPENEXPERT_HOST` / `HOST` / `PORT`                                                     | Interface and port the local server binds (loopback and 3000 by default)        |
| `OPENEXPERT_ALLOWED_ORIGINS`                                                            | Extra names the server answers to (LAN address, proxy domain), comma separated  |
| `OPENEXPERT_LOG_LEVEL`                                                                  | `debug` \| `info` \| `warn` \| `error` (default: `debug`, `info` in production) |

`.env` is git-ignored. The CLI wizard stores secrets in
`~/.openexpert/secrets.json`, which the server loads into the environment at
startup (existing env vars win), so `npm run dev` and `openexpert serve` behave
the same.

### Configuration files and the settings panel

The **Configuration** panel (`/settings`) edits the same canonical files the CLI
uses:

- `openexpert.json` — provider, model, sampling (`ai`) and chat options.
- `~/.openexpert/secrets.json` (mode `0600`) — API keys.

Precedence when reading: real environment variables > `openexpert.json` >
`secrets.json` > defaults. The server loads both files into `process.env` at
startup and mirrors panel changes at runtime, so a change takes effect without
restarting. UI preferences (theme, density, language) live in the `settings`
table of the SQLite database.

The interface language (Spanish/English) is one of those preferences; the
settings layer on the client is `src/lib/i18n.tsx` with the English dictionary
in `src/locales/en.ts` (Spanish is the source language). A missing entry is not
an error: `translate` falls back to the Spanish text, which is why a gap shows up
as Spanish leaking into English mode instead of a crash. `src/locales/en.test.ts`
reads every literal `t("…")` in `src/` with the TypeScript parser and fails when
one of them has no entry, so the gap cannot come back unnoticed; keys computed at
runtime are outside that check.

## 4. Scripts

| Script                            | Function                                      |
| --------------------------------- | --------------------------------------------- |
| `npm run dev`                     | Dev server on port **3000** (fixed)           |
| `npm run build`                   | Production build (Nitro `node-server`)        |
| `npm run preview`                 | Serve the build                               |
| `npm run lint` / `lint:fix`       | ESLint                                        |
| `npm run format` / `format:check` | Prettier                                      |
| `npm run typecheck`               | TypeScript without emit                       |
| `npm run test:run` / `npm test`   | Tests (app + package)                         |
| `npm run openexpert:doctor`       | CLI diagnostics                               |
| `npm run openexpert:serve`        | Boot the app through the CLI                  |
| `npm run license:check`           | Verify SPDX headers                           |
| `npm run test:coverage`           | Tests with coverage thresholds                |
| `npm run check:docs`              | Documentation links                           |
| `npm run check:commits`           | DCO + Conventional Commits (CI)               |
| `npm run build:dev`               | Build with the development mode               |
| `npm run desktop:dev`             | Tauri window in development mode              |
| `npm run desktop:build`           | Raw Tauri build (does not inject the version) |
| `npm run changeset`               | Draft the changeset for the next release      |
| `npm run version-packages`        | Apply pending changesets locally              |
| `npm run release`                 | Build, then publish with Changesets           |

### Port 3000

`vite.config.ts` pins `port: 3000` and `strictPort: true`; the Drive OAuth
redirect URI depends on it. The Nitro preset is always `node-server`.

## 5. Database

The schema is `drizzle/schema.ts` (Drizzle) plus `drizzle/init.sql` (the baseline
DDL). `src/lib/db.server.ts` opens the SQLite file, applies the baseline DDL,
runs pending migrations and seeds the configuration (Experts and integrations).

**Schema changes:** keep `schema.ts` and `init.sql` in sync for fresh installs
and add a numbered file under `drizzle/migrations/` (e.g. `0002_add_x.sql`) for
existing databases. The runner applies them in order using `PRAGMA
user_version`, so an old database is upgraded at startup. The numbers have
historical gaps (there is no `0003`): what matters is the order and the
`user_version`, not that the next file is the next integer.

After any write, call `await persist()`: it writes the file atomically
(`.tmp` + `rename`).

## 6. Code conventions

- File-based routes in `src/routes/`; `routeTree.gen.ts` is generated.
- `.server.ts` modules are server-only.
- Validation at the edge with Zod; user-facing messages in Spanish.
- Format with Prettier; no implicit `any`.

## 7. Pre-flight verification

```sh
npm run typecheck
npm run lint
npm run test:run
npm run build
```

## 8. Continuous integration and releases

Every change reaches `main` through a pull request: the branch is protected by a
ruleset (no direct pushes, no force pushes, no deletions), and
[`.github/required-checks.md`](../../.github/required-checks.md) carries the
version of that ruleset that also makes the checks block the merge — today a red
run can still be merged, which is how pull request #48 landed broken.

The desktop window and the Docker smoke test are jobs of `ci.yml` gated on the
files they build, so a documentation pull request pays for neither. There is no
run on push to `main`: the pull request already validated that tree.

| Workflow             | Runs on                                                 | What it does                                                                                                                      |
| -------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`             | PRs to `main`, manual                                   | lint, format, licenses, doc links, typecheck, tests, build; the desktop window and the Docker smoke test when their inputs change |
| `codeql.yml`         | PRs to `main`, weekly                                   | CodeQL analysis                                                                                                                   |
| `scorecard.yml`      | weekly, branch-protection changes, manual               | OpenSSF Scorecard                                                                                                                 |
| `pages.yml`          | changes under `site/`, manual                           | deploys the static site to GitHub Pages                                                                                           |
| `release.yml`        | push to `main` (except `docs/**` and `site/**`), manual | Changesets version/publish, then attaches the standalone server bundle and builds the image                                       |
| `server-release.yml` | manual                                                  | repairs a release that shipped without its server bundle (`-f tag=<tag>`)                                                         |

Five workflows run on their own triggers (`ci`, `codeql`, `scorecard`, `pages`,
`release`); `server-release.yml` only exists as the manual repair hatch.

Rules that keep CI trustworthy:

- Every `uses:` is pinned to a full commit SHA with the version in a trailing
  comment; Dependabot updates both. Never replace a SHA with a moving tag.
- Tools downloaded at run time (`actionlint`, `gitleaks`) are fetched at a fixed
  version and checked against the `*_checksums.txt` published with that release
  before they are executed.
- The `github/codeql-action` steps of a workflow move as one version: CodeQL
  aborts when they disagree, so Dependabot groups them
  (`github/codeql-action*`) and a bump arrives as a single pull request.
- Top-level `permissions:` is read-only everywhere and each job asks for the
  write scope it needs. A job-level `permissions:` block **replaces** the
  workflow one, so a job that uses `actions/checkout` must repeat
  `contents: read`.

**Releases.** Draft the note for your change with `npm run changeset` and
commit the file it writes under `.changeset/`; documentation-only changes need
none, because the root manifest is private and is not versioned. Merging the
`chore(release): version packages` pull request
publishes to npm (OIDC trusted publishing, no `NPM_TOKEN`) and builds the Docker
image. That PR is opened by `changesets/action` with the default `GITHUB_TOKEN`,
so its workflows arrive as **"action_required"** and must be approved (Actions →
the run → _Approve and run_) before its checks mean anything.

## 9. References

- [Architecture](./02-architecture.md) — code map.
- [Data model](./03-data-model.md) — tables.
- [Deployment](./08-deployment.md) — running it.
