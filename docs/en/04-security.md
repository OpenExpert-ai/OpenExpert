# 04 · Security & access

> **Audience:** both. Single-owner local edition.

---

## 1. Who can use it

There is **no login**. OpenExpert runs on your machine for a single owner. The
browser and the server are the same trusted environment. The server listens on
port 3000; by default it binds all interfaces, so if you expose it beyond
`localhost` put it behind a firewall or reverse proxy.

## 2. Isolation between Experts

No Expert can read data outside its domains. Each read tool belongs to a domain
(`ventas`, `finanzas`, `marketing`, `clientes`) and the server checks that the
active Expert lists that domain before returning data. Out-of-context calls
return an explicit error, not data. Google Drive access is decided by the
Expert's `sources` column, and local folder access by the `local` source,
restricted to the folders the user granted.

## 3. Guarantees against assistant misuse

1. **Pre-filter.** `src/lib/ai/injection.ts` blocks known injection patterns
   before the model runs and logs the attempt with status `denied`.
2. **Server-side checks.** Domain isolation is enforced in `chat.server.ts`, not
   by the model.
3. **Human approval.** The assistant only _proposes_ actions (`propose_*`);
   nothing changes until you approve the card.
4. **Transport hardening.** Every response carries `X-Content-Type-Options`,
   `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy`, plus a
   `Content-Security-Policy` in production. The `/api/*` routes (chat, backup)
   reject cross-origin requests; server functions are protected by the CSRF
   middleware in `src/start.ts`.

## 4. Secret management

| Secret                                          | Where                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `GOOGLE_API_KEY`, `OPENEXPERT_MODEL_KEY`        | `.env` or `~/.openexpert/secrets.json` (`0600`)                                  |
| `GOOGLE_CLIENT_SECRET`, `GOOGLE_PICKER_API_KEY` | env or `~/.openexpert/secrets.json` (`0600`)                                     |
| Google Drive tokens                             | `~/.openexpert/credentials.json` (`0600`, AES-256-GCM encrypted)                 |
| Picker grants (the files you picked)            | `~/.openexpert/drive-grants.json` (`0600`, AES-256-GCM encrypted)                |
| Local folder grants                             | `~/.openexpert/local-roots.json` (`0600`, AES-256-GCM encrypted)                 |
| OAuth `state` signing key                       | `GOOGLE_OAUTH_STATE_SECRET` or a generated `~/.openexpert/state-secret` (`0600`) |
| Encryption key file                             | `~/.openexpert/secret.key` (`0600`, generated on first run)                      |

Rules:

- `.env`, `openexpert.json`, `~/.openexpert/` are git-ignored and never
  committed.
- Secrets are stored server-side and are not part of the normal data flow. The
  local settings panel can **reveal** a stored key on demand (the "Copiar"
  button), so treat the browser as trusted and do not expose the port.
- Backups (`GET /api/backup`) embed `secrets.json` and `credentials.json`.
  Cross-origin downloads are rejected; still, download backups only on a
  trusted machine and store them safely.
- The Drive OAuth `state` carries a PKCE verifier signed with HMAC; the
  callback verifies the MAC in constant time.
- Drive tokens and the Picker grants are AES-256-GCM encrypted with a key
  generated and stored on the local machine (`~/.openexpert/secret.key`).
- Local files are read/written **only** inside the granted folders: every path
  is resolved with `realpath` and checked against the roots, so symlink escapes
  are rejected. Dotfiles, `.git`, `node_modules` and secret files are skipped.
- Google user data is used only for the in-product features (chat, source
  list, backup). No training of non-personalised models. No sale or transfer to
  advertising platforms. See [`PRIVACY.md`](../../PRIVACY.md).

## 5. Data at rest

The database is a plain SQLite file you own. Encryption is provided by your
disk, not by the app. Back it up by copying `OPENEXPERT_DATA_DIR`.

## 6. Activity log and revert

Every revertible change stores the prior rows in `snapshot.entries`; the
activity screen can replay them. Revertible: `experts`, `integrations`,
`invoices`, `campaigns`.

## 7. References

- [Data model](./03-data-model.md) — tables.
- [AI](./05-ai.md) — tools and limits.
- [Integrations](./06-integrations.md) — Drive tokens.
