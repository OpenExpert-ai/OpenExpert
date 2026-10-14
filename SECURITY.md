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

- **GitHub Security Advisories (preferred):** open a private advisory at
  `https://github.com/OpenExpert-ai/OpenExpert/security/advisories/new`.
- If you cannot use advisories, contact a maintainer listed in
  [`GOVERNANCE.md`](./GOVERNANCE.md) through a private channel.

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
  Google refresh tokens are server-side only; they are never part of the client
  bundle. The local settings panel can reveal a stored key on demand (the
  browser is a trusted environment in the single-owner edition).
- The Google Drive OAuth `state` is HMAC-signed and verified in constant time.
- All writes go through server functions; the database is a local SQLite file
  that never leaves your machine.
- The chat blocks prompt-injection attempts with a regex pre-filter and
  records the event in the activity log.

## Operational secrets

There are no production endpoints or cloud credentials. Everything runs
locally; the only secrets are your model key and your Google Drive tokens,
which stay on your machine.

## Known advisories

- **`mammoth` → `argparse@~1.0.3`** (moderate; `sprintf-js` prototype pollution
  reachable through `argparse`). `mammoth` is used to read `.docx` text, and
  `1.13.0` — the current release — still pins that range. The affected code sits
  in `mammoth`'s command line interface, which the app never runs: only
  `mammoth.extractRawText()` is imported, as a library. Accepted on that
  reasoning until `mammoth` relaxes the range; `npm audit fix --force` would only
  hide the report by downgrading `mammoth`.

## Network exposure

The local server binds to `127.0.0.1` and has no authentication, so only
processes on the same machine can reach the dashboard and the folders its owner
granted. Setting `OPENEXPERT_HOST` (or `HOST`) to another interface publishes it
to that network; the Docker image binds every interface by design. See
`docs/en/08-deployment.md`.
