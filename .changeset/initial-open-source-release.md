---
"@openexpert/opencore": minor
---

OpenCore — the MIT engine and CLI of the local edition.

- Model provider selector: `google` (Gemini), `ollama` (local) and
  `openai-compatible` (BYOK).
- `config` loader (`openexpert.json` + `OPENEXPERT_*`), storage/token
  interfaces and the tool catalog.
- CLI: interactive setup wizard plus `doctor`, `fix`, `models`, `serve` and
  `update`.
- Built with `tsup` (ESM + `.d.ts`); `main`/`exports`/`types`/`files` set.
