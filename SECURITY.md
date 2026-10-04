# Security

OpenExpert is distributed as open-source software under the MIT license.
The full codebase, including the cloud application code in this repository,
is MIT-licensed; **the project does not rely on license-based secrecy for
its security**. Sensitive material is protected by access control, isolation
between Experts, and operational hygiene rather than by keeping code private.

## Supported versions

| Version             | Supported   |
| ------------------- | ----------- |
| `main` branch       | yes         |
| latest released tag | yes         |
| older tags          | best-effort |

## Reporting a vulnerability

Please **do not** file a public issue for suspected vulnerabilities.

- **GitHub Security Advisories:** open a private advisory at
  `https://github.com/OpenExpert-ai/OpenExpert/security/advisories/new`.
- **Email:** `carlosemerito13@gmail.com`.

Include: reproduction steps, affected version/commit, impact, and any
proof-of-concept. Encrypt sensitive details with the maintainers' PGP key
when one is published alongside this file.

## Disclosure timeline

1. Acknowledge within **3 business days**.
2. Triage and confirm within **10 business days**.
3. Coordinate a fix and disclosure. Critical issues are addressed urgently.

## Secret hygiene

- `.env`, `openexpert.json`, `~/.openexpert/`, and `credentials.json` are
  listed in `.gitignore` and must never be committed.
- `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`, `OPENEXPERT_API_KEY`,
  `OPENEXPERT_MODEL_KEY`, and refresh tokens are server-side only and are
  never sent to the browser bundle.
- The OAuth `state` parameter is HMAC-signed and verified in constant time.
- All write operations go through server functions with explicit permission
  checks; RLS grants members read-only access as a defence in depth.
- The chat blocks prompt-injection attempts with a regex pre-filter and
  records the event in the activity log.

## Operational secrets (not in the public repo)

Production endpoints (Supabase project reference, custom domains, gateway
URLs, billing identifiers) are tracked in an **operations** document that
lives outside this repository. They are not required to build, run, or
contribute to the project.
