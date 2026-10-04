---
"@openexpert/opencore": minor
---

Initial open-source release of `@openexpert/opencore` under the MIT license.

- Build step (`tsup`) emits ESM + `.d.ts`; `main`/`exports`/`types`/`files` configured.
- CLI binary (`opencore`) supports `doctor` (configuration diagnostics) and `serve` (boots the local application).
- New `openexpert` model provider pointing at the OpenExpert gateway (`OPENEXPERT_GATEWAY_URL` / `OPENEXPERT_API_KEY`).
- JSON Schema for `openexpert.json` and validated precedence env > file > defaults.
- Pre-flight seed data (no business data) so the local edition is usable on first run.
