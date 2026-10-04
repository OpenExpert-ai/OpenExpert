# Security

OpenExpert is distributed as open-source software under the MIT license.
The entire codebase is MIT-licensed; **the project does not rely on
license-based secrecy for its security**. It runs locally on your machine:
data is a local SQLite file, model keys and Google Drive tokens stay on
your disk, and nothing is exposed beyond the port you bind.

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

- `.env`, `openexpert.json`, `~/.openexpert/`, `credentials.json` and
  `secrets.json` are git-ignored and must never be committed.
- `GOOGLE_API_KEY`, `OPENEXPERT_MODEL_KEY`, `GOOGLE_CLIENT_SECRET` and the
  Google refresh tokens are server-side only and are never sent to the
  browser bundle.
- The Google Drive OAuth `state` is HMAC-signed and verified in constant time.
- All writes go through server functions; the database is a local SQLite file
  that never leaves your machine.
- The chat blocks prompt-injection attempts with a regex pre-filter and
  records the event in the activity log.

## Operational secrets

There are no production endpoints or cloud credentials. Everything runs
locally; the only secrets are your model key and your Google Drive tokens,
which stay on your machine.
