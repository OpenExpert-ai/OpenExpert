# @openexpert/opencore

## 1.0.0

### Major Changes

- 45f8c28: Require Node.js 24 or later (npm 11+). Node.js 20 is end-of-life and the
  build/test toolchain (Vite 8, Vitest 5, Changesets 3) now targets Node.js 24.

### Minor Changes

- 0f32676: Add the `opencore desktop` command: it starts (or reuses) the local server and
  opens the native OpenExpert window (Tauri + WebKitGTK), then stops the server
  when the window closes.
- dbb8d94: OpenCore — the MIT engine and CLI of the local edition.

  - Model provider selector: `google` (Gemini), `ollama` (local) and
    `openai-compatible` (BYOK).
  - `config` loader (`openexpert.json` + `OPENEXPERT_*`), storage/token
    interfaces and the tool catalog.
  - CLI: interactive setup wizard plus `doctor`, `fix`, `models`, `serve` and
    `update`.
  - Built with `tsup` (ESM + `.d.ts`); `main`/`exports`/`types`/`files` set.

- 11fe47a: Add `chat.injectionExtraPatterns` to the configuration file, and wire the chat
  options (maxSteps, injection guard, retention, default approval) into the
  endpoint. Adds the advanced diagnostics and raw-config editor to the settings
  panel.
- e271df8: Extend `openexpert.json` with `ai` (temperature, topP, maxOutputTokens) and
  `chat` (maxSteps, injectionGuard, retentionDays, defaultApproval) options, with
  matching JSON-schema and `loadConfig` support.
