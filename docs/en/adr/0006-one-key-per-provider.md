# 006 · One key per provider

- **Status:** accepted.
- **Date:** 2026-10.

## Context

The catalogue gives every provider a record. The first version let two of them
(`openai-compatible` and `opencode-go`) name **the same variable** for their key,
and nothing failed until both were configured: the second key overwrote the
first, and the provider that lost it answered 401 as if it had never been set up.
Anthropic's record declared its own variable, but the settings panel had no field
for it — its list of providers was written by hand — so its key could not be
stored at all.

## Decision

**A provider's key belongs to that provider.** Every record declares the variable
that holds it, and no two records may share one; a test enforces it. The
catalogue is the only place that knows where a key, an endpoint or a list of
models comes from, and everything that needs the answer — the settings panel, the
CLI, `doctor`, the model listing — reads it off the record instead of keeping a
list of its own. A missing key is reported by naming the variable that is
missing, never by trying another provider's.

## Consequences

- Adding a provider is adding a record: its key field, its endpoint and its
  models show up without touching the interface or the validators.
- Switching providers does not erase keys, so moving back and forth is free.
- A provider that keeps no key (a local model) cannot be given one: the request
  is rejected instead of silently dropped.
- Each endpoint is written where its record says: the local server's URL is
  configuration (`openexpert.json`) and any other user-supplied one is a secret.
