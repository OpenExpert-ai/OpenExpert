# 004 · Server-side Expert domain isolation

- **Status:** accepted.
- **Date:** 2025-10.

## Context

"Experts" (ventas, finanzas, marketing, general) must not read each other's
data. A model cannot be trusted to enforce this: the system prompt can be
ignored or manipulated.

## Decision

Every read tool declares a domain. `domainAllowed(expertId, domain)` in
`src/lib/ai/chat.server.ts` is checked **inside each tool's `execute`**, before
any data is returned; out-of-context calls return an explicit error instead of
data. This is the local analogue of RLS.

## Consequences

- Domain isolation holds even if the model is jailbroken; the pre-filter
  (`src/lib/ai/injection.ts`) is defence in depth, not the guarantee.
- Destructive actions are never taken by a tool: they are only _proposed_ and
  require human approval (`propose_*`).
- Adding a tool means declaring its domain and testing the denial path.
