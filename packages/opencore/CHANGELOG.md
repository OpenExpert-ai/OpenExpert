# @openexpert/opencore

## 0.3.0

### Minor Changes

- 096d377: Raise the default sampling `ai.temperature` from 0.2 to 0.5.
- 214e8a6: Add `notionClientId` to `openexpert.json` (the non-secret Notion OAuth client ID),
  mirroring `googleClientId`. The client secret stays in `secrets.json` /
  environment.
- d13e226: Remove the autonomous-process tools (`list_processes`, `request_process_run`) and
  the `processes` table name from the storage interface. The feature was a mock and
  has been removed from the app; see the roadmap to rebuild it for real.

## 0.2.1

### Patch Changes

- 3e4755d: Fix the release automation: use `changesets/action@v2`. `@changesets/cli@3` no
  longer prints the `New tag:` line that the v1 action parsed, so releases were
  published to npm but no git tags, GitHub releases or Docker images were created.

## 0.2.0

### Minor Changes

- 949ddf9: Add the `opencore desktop` command: it starts (or reuses) the local server and
  opens the native OpenExpert window (Tauri + WebKitGTK), then stops the server
  when the window closes.
- 949ddf9: OpenCore — the MIT engine and CLI of the local edition.

  - Model provider selector: `google` (Gemini), `ollama` (local) and
    `openai-compatible` (BYOK).
  - `config` loader (`openexpert.json` + `OPENEXPERT_*`), storage/token
    interfaces and the tool catalog.
  - CLI: interactive setup wizard plus `doctor`, `fix`, `models`, `serve` and
    `update`.
  - Built with `tsup` (ESM + `.d.ts`); `main`/`exports`/`types`/`files` set.

- a780ea0: Simplify the local edition surface:

  - Drop the unused `chat.defaultApproval` option from `ChatConfig`, the JSON
    schema and the settings panel.
  - `TableName`/`LOCAL_TABLES` now list the real local tables (`deals`,
    `accounts`, `settings`, …) instead of removed multi-user tables.
  - Normalise `OLLAMA_BASE_URL`: accept the native root or the `/v1` URL for both
    chat and model listing.

- 949ddf9: Require Node.js 24 or later (npm 11+). Node.js 20 is end-of-life and the
  build/test toolchain (Vite 8, Vitest 5, Changesets 3) now targets Node.js 24.
- 949ddf9: Add `chat.injectionExtraPatterns` to the configuration file, and wire the chat
  options (maxSteps, injection guard, retention) into the
  endpoint. Adds the advanced diagnostics and raw-config editor to the settings
  panel.
- 949ddf9: Extend `openexpert.json` with `ai` (temperature, topP, maxOutputTokens) and
  `chat` (maxSteps, injectionGuard, retentionDays) options, with
  matching JSON-schema and `loadConfig` support.
