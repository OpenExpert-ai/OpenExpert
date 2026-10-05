# 04 · Security & access

> **Audience:** both. Single-owner local edition.

---

## 1. Who can use it

There is **no login**. OpenExpert runs on your machine for a single owner. The
browser and the server are the same trusted environment. The server listens on
port 3000; by default it binds all interfaces, so if you expose it beyond
`localhost` put it behind a firewall or reverse proxy.

## 2. Isolation between Experts

No Expert can read another Expert's data. Each read tool belongs to a domain
(`ventas`, `finanzas`, `marketing`, `general`) and the server checks that the
active Expert matches the domain (or is `general`) before returning data.
Out-of-context calls return an explicit error, not data. Google Drive access is
decided by the Expert's `sources` column.

## 3. Guarantees against assistant misuse

1. **Pre-filter.** `src/lib/ai/injection.ts` blocks known injection patterns
   before the model runs and logs the attempt with status `denied`.
2. **Server-side checks.** Domain isolation is enforced in `chat.server.ts`, not
   by the model.
3. **Human approval.** The assistant only _proposes_ actions (`propose_*`,
   `request_process_run`); nothing changes until you approve the card.
4. **Transport hardening.** Every response carries `X-Content-Type-Options`,
   `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy`, plus a
   `Content-Security-Policy` in production. The `/api/*` routes (chat, backup)
   reject cross-origin requests; server functions are protected by the CSRF
   middleware in `src/start.ts`.

## 4. Secret management

| Secret                                   | Where                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `GOOGLE_API_KEY`, `OPENEXPERT_MODEL_KEY` | `.env` or `~/.openexpert/secrets.json` (`0600`)                                  |
| Google Drive tokens                      | `~/.openexpert/credentials.json` (`0600`)                                        |
| OAuth `state` signing key                | `GOOGLE_OAUTH_STATE_SECRET` or a generated `~/.openexpert/state-secret` (`0600`) |

Rules:

- `.env`, `openexpert.json`, `~/.openexpert/` are git-ignored and never
  committed.
- Secrets are stored server-side and are not part of the normal data flow. The
  local settings panel can **reveal** a stored key on demand (the "Revelar"
  button), so treat the browser as trusted and do not expose the port.
- Backups (`GET /api/backup`) embed `secrets.json` and `credentials.json`.
  Cross-origin downloads are rejected; still, download backups only on a
  trusted machine and store them safely.
- The Drive OAuth `state` is HMAC-signed and compared in constant time.

## 5. Data at rest

The database is a plain SQLite file you own. Encryption is provided by your
disk, not by the app. Back it up by copying `OPENEXPERT_DATA_DIR`.

## 6. Activity log and revert

Every revertible change stores the prior rows in `snapshot.entries`; the
activity screen can replay them. Revertible: `experts`, `integrations`,
`processes`, `invoices`, `campaigns`.

## 7. References

- [Data model](./03-data-model.md) — tables.
- [AI](./05-ai.md) — tools and limits.
- [Integrations](./06-integrations.md) — Drive tokens.
