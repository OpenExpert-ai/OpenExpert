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

- Conversation retention: 30 days, opportunistic cleanup.
- Drive token refresh: automatic.
- Revert: each change keeps its snapshot in the activity log.

## 4. Diagnosis

### 4.1 Chat

| Symptom              | Cause                          | Action                           |
| -------------------- | ------------------------------ | -------------------------------- |
| Missing model key    | Provider not configured        | `opencore fix` / `opencore init` |
| Rate limit reached   | Provider quota                 | Wait or switch model             |
| Invalid key          | Wrong/restricted key           | Generate a new one               |
| "Out of context"     | Expert does not cover the data | Switch Expert; it is isolation   |
| Ollama not reachable | Ollama not running             | Start Ollama, `opencore doctor`  |

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
| Port 3000 busy | Another process    | Free port 3000                                    |

## 5. Backups

Copy `OPENEXPERT_DATA_DIR` (it contains `openexpert.db`, `credentials.json` and
`secrets.json`). Keep the copy secure: it holds your tokens.

## References

- [Deployment](./08-deployment.md) — how to start it.
- [Security & access](./04-security.md) — audit and revert.
