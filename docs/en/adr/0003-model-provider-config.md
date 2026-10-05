# 003 · Model provider is configuration, not code

- **Status:** accepted.
- **Date:** 2025-10.

## Context

The assistant must work with a local model (Ollama), a free hosted key (Google
Gemini) or any OpenAI-compatible endpoint (BYOK), without forking the app.

## Decision

Selection lives in `@openexpert/opencore/model-provider` and is driven by
configuration: `OPENEXPERT_MODEL_PROVIDER` / `OPENEXPERT_MODEL_ID` (env beats
`openexpert.json`, which beats defaults). `src/lib/opencore/model-provider.server.ts`
turns that selection into an AI SDK `LanguageModel`.

## Consequences

- The harness (tools, injection gate, persistence) never depends on a specific
  vendor.
- Keys are the only provider-specific secret; `missingKeyHint()` produces the
  user-facing message when one is missing.
- URL conventions differ per provider (e.g. Ollama native root vs `/v1`), so the
  provider module normalises base URLs (`ollamaApiBaseUrl`).
