# 09 · Operation & support

> **Audience:** both.

---

## 1. Cost

Infrastructure cost is **zero**: everything runs locally. If you use a remote
model (Gemini free tier or BYOK), you pay the provider; Ollama is free.

## 2. Recurring tasks

| Task                          | Frequency |
| ----------------------------- | --------- |
| Review the activity log       | Weekly    |
| Back up `OPENEXPERT_DATA_DIR` | Monthly   |
| Review source authorisations  | Monthly   |

## 3. Automatic maintenance

- Conversation retention: 30 days, opportunistic cleanup (0 disables it).
- Drive token refresh: automatic.
- Revert: each change keeps its snapshot in the activity log.

## 4. Diagnosis

### 4.1 Chat

| Symptom              | Cause                          | Action                               |
| -------------------- | ------------------------------ | ------------------------------------ |
| Missing model key    | Provider not configured        | `openexpert fix` / `openexpert init` |
| Rate limit reached   | Provider quota                 | Wait or switch model                 |
| Invalid key          | Wrong/restricted key           | Generate a new one                   |
| "Out of context"     | Expert does not cover the data | Switch Expert; it is isolation       |
| Ollama not reachable | Ollama not running             | Start Ollama, `openexpert doctor`    |

### 4.2 Google Drive

| Symptom                        | Cause                         | Action                             |
| ------------------------------ | ----------------------------- | ---------------------------------- |
| "Drive not connected"          | Not connected or revoked      | _Integrations → Sources_ → connect |
| Expires every week             | Consent in Testing            | Move to **In production**          |
| Drive not enabled in an Expert | Missing `gdrive` in `sources` | Add it in the Expert               |
| Insufficient permissions       | Account cannot reach the file | Review file permissions            |

### 4.3 Database

| Symptom        | Cause              | Action                                            |
| -------------- | ------------------ | ------------------------------------------------- |
| Data lost      | File deleted/moved | Restore from your backup of `OPENEXPERT_DATA_DIR` |
| Port 3000 busy | Another process    | Free port 3000, or `PORT=3100 openexpert`         |

The commands in this table run in a terminal: `openexpert doctor`, `fix`, `init`
and `version` do not open the window. Only `openexpert` with no arguments (or
`openexpert desktop`) starts the graphical shell.

### 4.4 Desktop launcher

| Symptom                              | Cause                                         | Action                                                      |
| ------------------------------------ | --------------------------------------------- | ----------------------------------------------------------- |
| The menu entry does nothing          | launcher pointing at a file that is not there | `npm run desktop:check`, then `npm run desktop:install`     |
| The window shows another application | another process owns the port                 | `ss -ltnp \| grep :3000`; free it or start with `PORT=3100` |
| The window is blank after `git pull` | window older than the server                  | reinstall it: `npm run desktop:install`                     |

`install.sh --doctor` performs the same launcher check and exits non-zero when it
fails, so it can be used from a script.

## 5. Backups

Copy `OPENEXPERT_DATA_DIR`. It holds `openexpert.db`, `secrets.json`,
`credentials.json`, `drive-grants.json`, `local-roots.json`, `notion.json`,
`secret.key`, `state-secret` and `state-secret-notion`. `openexpert.json` lives
in the directory the app is started from, so copy that one too. Keep the copy
secure: it holds your tokens and the keys that decrypt and sign them.

`GET /api/backup` (Settings → Data → Download backup) packs the same set into a
single JSON file: the database, `openexpert.json`, `secrets.json`, the encrypted
credential files and `secret.key`. Importing it rewrites all of them, so Drive,
the Picker selection, the local folders and Notion come back connected. Because
the file carries the key, it is as sensitive as the tokens themselves: keep it
where you would keep a password. Bundles written before format 2 carried only
the database, the configuration and the credential files without the key;
importing one reports what it could not bring.

A bundle is a file that arrives from outside, so the configuration it carries
is checked before anything is written: the same limits the panel and the raw
editor enforce. A copy whose `openexpert.json` asks for more than 200 steps per
query, more than 3650 days of history or a pattern that can freeze the server
is refused whole, and the message says which field breaks which limit. Nothing
is changed when a copy is refused: the installation keeps the configuration it
had.

The database inside the bundle is checked for the same reason: an
`openexpert.db` written by a **newer** OpenExpert (a bundle restored from another
machine running a later build, or from a beta) carries tables this version does
not know. The app refuses it instead of opening it and writing blind over a
schema it has never read: the message says which version the database comes from
and how far this installation understands, and nothing is touched — neither the
target database nor its `.bak`. Update OpenExpert and import the bundle again.
The same holds at startup: an `openexpert.db` with a newer schema is not opened,
and the message says why.

## References

- [Deployment](./08-deployment.md) — how to start it.
- [Security & access](./04-security.md) — audit and revert.
