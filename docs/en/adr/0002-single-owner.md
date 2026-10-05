# 002 · Single-owner, no authentication

- **Status:** accepted.
- **Date:** 2025-10 (local-first rewrite).

## Context

Earlier versions were a multi-user cloud app with Supabase auth, roles and
row-level security. The local edition targets one person on their own machine.

## Decision

Drop authentication, `profiles`, `user_roles`, `expert_access` and
`invitations`. The workspace has a single implicit owner ("Propietario local").
Authorization is not a code path; isolation between Experts is the only access
control (see ADR 004).

## Consequences

- Much smaller surface: no sessions, no RLS, no user management.
- The server is trusted. It binds all interfaces by default, so exposing the
  port beyond `localhost` is explicitly the operator's responsibility
  (`docs/en/04-security.md`).
- Re-adding multi-user would be a new ADR and a breaking rewrite.
