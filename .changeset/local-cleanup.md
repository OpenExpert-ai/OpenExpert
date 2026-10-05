---
"@openexpert/opencore": minor
---

Simplify the local edition surface:

- Drop the unused `chat.defaultApproval` option from `ChatConfig`, the JSON
  schema and the settings panel.
- `TableName`/`LOCAL_TABLES` now list the real local tables (`deals`,
  `accounts`, `settings`, …) instead of removed multi-user tables.
- Normalise `OLLAMA_BASE_URL`: accept the native root or the `/v1` URL for both
  chat and model listing.
