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
restricted to the folders the user granted; Notion access by the `notion` source,
restricted to the pages shared in Notion's picker.

## 3. Guarantees against assistant misuse

1. **Pre-filter.** `src/lib/ai/injection.ts` blocks known injection patterns
   before the model runs and logs the attempt with status `denied`, naming the
   message that tripped it. It checks the whole conversation, not just the last
   message, because the model receives the full history and every message's role
   comes from the client. A denied turn is not stored, and the history is read
   back without the messages the filter rejects, so a conversation cannot stay
   locked by a message that is already inside it.
   **What the model wrote is not an attempt.** The catalogue names words a
   normal technical answer uses (`bypass`, `system prompt`), so a reply of the
   model that contained one of them used to be accepted. The database is what
   knows which replies came from the model: they are matched against the
   stored replies, and an `assistant` whose text is not in the database still
   counts as an attempt, because the role comes from the client.
   The owner's extra patterns are checked by **measuring how long they take**
   against an adversarial input (`src/lib/ai/redos.server.ts`), not only by
   their shape: an expression with catastrophic backtracking does not fail, it
   freezes the process, and the check happens on the thread that serves the
   application, for every message of the turn. The measurement runs inside a
   `vm` context, whose timeout cuts the expression off if it does not come
   back, so measuring a bad pattern does not freeze whoever measures it. The
   measured input is built from one character of every part the pattern can
   consume —a `\d` is tried with a digit, a `\s` with a space, an `ñ` with an
   `ñ`—, because a probe of ASCII letters alone measures zero against a pattern
   that only chokes on numbers.
2. **Server-side checks.** Domain isolation is enforced in `chat.server.ts`, not
   by the model.
3. **Human approval.** The assistant only _proposes_ actions (`propose_*`);
   nothing changes until you approve the card.
4. **Sandboxed code.** `run_python` runs a script only when `bubblewrap` can lock
   it in a temporary directory with no network and no view of the rest of the disk.
   Without `bubblewrap` it does not run: a network namespace isolates the network
   and leaves your keys readable, which is worse than not running anything
   (`src/lib/python.server.ts`).
5. **Transport hardening.** Every response carries `X-Content-Type-Options`,
   `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy`, plus a
   `Content-Security-Policy` in production. The `/api/*` routes (chat, backup)
   reject cross-origin requests; server functions are protected by the CSRF
   middleware in `src/start.ts`.

## 4. Secret management

| Secret                                                                                                    | Where                                                                                   |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Model provider keys: `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `OPENEXPERT_MODEL_KEY`, `OPENCODE_GO_API_KEY` | `.env` or `~/.openexpert/secrets.json` (`0600`); one variable per provider, none shared |
| `GOOGLE_CLIENT_SECRET`, `GOOGLE_PICKER_API_KEY`                                                           | env or `~/.openexpert/secrets.json` (`0600`)                                            |
| Google Drive tokens                                                                                       | `~/.openexpert/credentials.json` (`0600`, AES-256-GCM encrypted)                        |
| Picker grants (the files you picked)                                                                      | `~/.openexpert/drive-grants.json` (`0600`, AES-256-GCM encrypted)                       |
| Local folder grants                                                                                       | `~/.openexpert/local-roots.json` (`0600`, AES-256-GCM encrypted)                        |
| Notion OAuth token                                                                                        | `~/.openexpert/notion.json` (`0600`, AES-256-GCM encrypted)                             |
| OAuth `state` signing key                                                                                 | `GOOGLE_OAUTH_STATE_SECRET` or a generated `~/.openexpert/state-secret` (`0600`)        |
| Encryption key file                                                                                       | `~/.openexpert/secret.key` (`0600`, generated on first run)                             |

Rules:

- `.env`, `openexpert.json`, `~/.openexpert/` are git-ignored and never
  committed.
- Secrets are stored server-side and are not part of the normal data flow. The
  local settings panel can **reveal** a stored key on demand (the "Copiar"
  button), so treat the browser as trusted and do not expose the port.
- Backups downloaded from **Settings → Data** are AES-256-GCM encrypted with a
  passphrase you choose. The passphrase is not stored: losing it loses the
  backup. The legacy plain bundle (`GET /api/backup`) embeds `secrets.json`, the
  encrypted credential files and `secret.key`; it is still available for old
  copies, but download it only on a trusted machine.
- A restored `openexpert.json` is **validated before it is written**: a bundle
  is a file that arrives from outside, so the configuration it carries goes
  through the same schema the settings panel and the raw editor use. A copy
  that asks for more than 200 steps per query (each step is a billable
  provider call), more than 3650 days of history, more than 200000 output
  tokens or an injection pattern that can freeze the server is refused whole,
  and the message names the field and the limit it breaks.
- The **read** of `openexpert.json` applies the same limits. The file is a
  project file that the documentation says can be edited by hand, and it can
  also come from a version that did not have the limits, so a value above
  them is brought back to the limit when the file is read — by the server and
  by the CLI alike, which share one reader. Nothing runs with 100000 steps per
  query because the file says so. The list of injection patterns is capped at
  fifty for the same reason: each one is measured before it is used, and five
  thousand of them cost thirty seconds of blocked thread on the first chat.
- A limit brought back is **announced, never silent**: the settings screen
  (Settings → Advanced → Diagnostics) lists what was cut and to what, and
  `openexpert doctor` says the same. A file that says one thing and a running
  application that does another is a thing the owner has to be told about.
- The Drive OAuth `state` carries a PKCE verifier signed with HMAC; the
  callback verifies the MAC in constant time.
- Drive tokens and the Picker grants are AES-256-GCM encrypted with a key
  generated and stored on the local machine (`~/.openexpert/secret.key`).
- Local files are read/written **only** inside the granted folders: every path
  is resolved with `realpath` and checked against the roots, so symlink escapes
  are rejected. Creating a file also refuses a name that already exists — a
  symlink counts even when it dangles, so the write cannot follow it out of the
  folder. Dotfiles, `.git`, `node_modules` and secret files are skipped.
- Google user data is used only for the in-product features (chat, source
  list, backup). No training of non-personalised models. No sale or transfer to
  advertising platforms. See [`PRIVACY.md`](../../PRIVACY.md).

## 5. Data at rest

The database is a plain SQLite file you own. The data directory is created
`0700` and the database `0600`, so another local user cannot read it; encryption
at rest is provided by your disk, not by the app. Back it up from
**Settings → Data** (encrypted) or by copying `OPENEXPERT_DATA_DIR`.

## 6. Activity log and revert

Every revertible change stores the prior rows in `snapshot.entries`; the
activity screen can replay them. Revertible: `experts`, `integrations`,
`invoices`, `campaigns`.

The log only reports what it can back up: `duration_ms` holds the time an
action really took, and it is **null** for the actions that are not timed
(creating an Expert, saving a setting, a Drive write). The screen shows a dash
there. The column used to carry a default of 300 ms, so every untimed event
was filed — and displayed — as "0.30s", which read in an audit trail as a
measurement nobody had made. Migration `0007` rebuilds the table without the
`NOT NULL` and without that default; the rows already stored keep their value,
because a past entry cannot be un-measured.

## 7. References

- [Data model](./03-data-model.md) — tables.
- [AI](./05-ai.md) — tools and limits.
- [Integrations](./06-integrations.md) — Drive tokens.
