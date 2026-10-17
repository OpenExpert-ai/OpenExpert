# @openexpert/opencore

## 0.4.0

### Minor Changes

- a000fc1: Una clave por proveedor: dos fichas del catálogo ya no pueden declarar la misma
  variable de clave, así que guardar la de un proveedor nunca pisa la de otro.
  OpenCode Go pasa a tener `OPENCODE_GO_API_KEY` en vez de compartir la ranura
  genérica. Preguntar a un proveedor qué modelos sirve pasa a ser un único camino
  de código (`listProviderModels`), que usan la aplicación y el CLI, y cubre el
  adaptador de Anthropic además de los endpoints compatibles.

## 0.3.1

### Patch Changes

- b710215: - `serve` and `desktop` start the local server on `127.0.0.1` instead of every
  interface, and `desktop` refuses a port owned by another application instead of
  pointing the window at it. `OPENEXPERT_HOST` (or `HOST`) exposes it on purpose.
  - `doctor` and `models` read the provider from the directory they were given,
    not from the process working directory.

## 0.3.0

### Minor Changes

- 096d377: Raise the default sampling `ai.temperature` from 0.2 to 0.5.
- 214e8a6: Add `notionClientId` to `openexpert.json` (the non-secret Notion OAuth client ID),
  mirroring `googleClientId`. The client secret stays in `secrets.json` /
  environment.
- d13e226: Remove the autonomous-process tools (`list_processes`, `request_process_run`) and
  the `processes` table name from the storage interface. The feature was a mock and
  has been removed from the app; see the roadmap to rebuild it for real.

### Patch Changes

- 83028ca: Normalise the Ollama base URL without the `/\/+$/` regex, which CodeQL reports as
  a polynomial ReDoS on a long run of slashes. Trailing slashes are now stripped
  with a loop; the `http://host`, `http://host/` and `http://host/v1` shapes keep
  behaving exactly as before.

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
