# 09 · Operation & support

> **Audience:** both. Business: tasks and costs. Engineering:
> diagnosis.

---

## 1. Costs and quotas (cloud)

Current operations stay within free plans. **Monthly infrastructure
cost: 0 €.**

| Service            | Plan      | Coverage                              | First charge        |
| ------------------ | --------- | ------------------------------------- | ------------------- |
| Supabase           | Free      | Database, auth, limited storage       | On exceeding quota  |
| Vercel             | Hobby     | Hosting, bandwidth included           | On exceeding quota  |
| Google AI Studio   | Free tier | Gemini request quota                  | On exhausting quota |
| Google Cloud/Drive | Free      | Drive API and OAuth, no card required | N/A                 |

| Limit reached       | Effect                                             |
| ------------------- | -------------------------------------------------- |
| Model quota         | Chat responds with limit message and wait guidance |
| Requests per minute | Possible 429 responses                             |
| Storage             | Writes stop                                        |
| Build limit         | Stop until cycle renews                            |

In local mode with Ollama there is no external inference cost.

## 2. Recurring tasks

| Task                                    | Frequency | Owner          |
| --------------------------------------- | --------- | -------------- |
| Review the activity log                 | Weekly    | ADMIN          |
| Renew authorisations nearing expiration | Monthly   | ADMIN          |
| Export the database                     | Monthly   | Engineering    |
| Review pending invitations              | Monthly   | ADMIN          |
| Update dependencies (`npm outdated`)    | Quarterly | Engineering    |
| Review integrations without credentials | Quarterly | Business + Eng |

In local mode, export is replaced by copying the data directory
(`OPENEXPERT_DATA_DIR`).

## 3. Automatic maintenance

- **Conversation retention:** 30 days, opportunistic cleanup on
  opening history.
- **Drive token refresh:** automatic.
- **Revert:** each change keeps its copy in the activity log.

## 4. Incident diagnosis

### 4.1. Sign-in

| Symptom                            | Likely cause                          | Action                                                     |
| ---------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `Error 400: redirect_uri_mismatch` | URI missing in OAuth client           | Register the URI. See [08-deployment](./08-deployment.md). |
| Denied access without detail       | Email not invited                     | Create the invitation or use the administrator account     |
| Session returns to `localhost`     | `site_url` not updated                | Set `site_url` to the domain.                              |
| "App not verified" warning         | Consent status, expected              | None. See [06-integrations](./06-integrations.md).         |
| Unexpected Google permissions      | URI confusion between login and Drive | Login should only ask for `email profile`.                 |

### 4.2. Google Drive

| Symptom                        | Cause                           | Action                             |
| ------------------------------ | ------------------------------- | ---------------------------------- |
| "Drive not connected"          | No connection or revocation     | _Integrations → Sources_ → connect |
| Expires every week             | Consent in Testing              | Move to **In production**.         |
| Drive not enabled in an Expert | Missing `gdrive` in `sources`   | Add it in the Expert edition.      |
| "Insufficient permissions"     | Account does not reach the file | Review file permissions.           |

### 4.3. Chat

| Symptom               | Cause                           | Action                                         |
| --------------------- | ------------------------------- | ---------------------------------------------- |
| Missing model key     | Variable empty or not deployed  | Fill it in `.env` and Vercel.                  |
| Model limit reached   | Ask the user to wait            | Wait for daily reset.                          |
| Invalid key           | Key incorrect or restricted     | Generate a new one.                            |
| "Out of context"      | Expert that does not cover data | Switch Expert. It is isolation, not a failure. |
| No access to Expert   | Insufficient permissions        | Request access from an ADMIN.                  |
| No execute permission | Missing `exec` level            | Request the permission.                        |

### 4.4. Database

| Symptom                     | Cause                        | Action                  |
| --------------------------- | ---------------------------- | ----------------------- |
| `db:migrate` aborts by hash | Migration edited after apply | Create a new migration. |
| 500 listing users           | NULL in `auth.users` tokens  | Fill with empty string. |
| Legitimate "unauthorised"   | No row in `profiles`         | Issue new invitation.   |

### 4.5. Deployment

| Symptom                         | Cause                             | Action                  |
| ------------------------------- | --------------------------------- | ----------------------- |
| Preview won't start sign-in     | Subdomain outside allow list      | Add the pattern.        |
| `undefined` values on screen    | `VITE_*` changed without redeploy | Redeploy.               |
| Server boots on another port    | 3000 taken (`strictPort`)         | Free port 3000.         |
| Missing variables in production | `.env` not deployed               | Declare them in Vercel. |

## 5. OpenCore local mode notes

| Aspect      | Cloud                       | Local                                                                  |
| ----------- | --------------------------- | ---------------------------------------------------------------------- |
| Diagnostics | Vercel / Supabase panels    | `npm run opencore:doctor`                                              |
| Backup      | PostgreSQL dump             | Copy of `OPENEXPERT_DATA_DIR`                                          |
| Secrets     | Vercel variables            | `credentials.json` (`0600`) + `openexpert.json`                        |
| Model       | Gemini via `GOOGLE_API_KEY` | Per `OPENEXPERT_MODEL_PROVIDER`; with Ollama verify local availability |

## 6. Scaling criteria

1. **Connect the pending integrations.** Maximum value without hosting
   cost.
2. **Tune permissions** per Expert.
3. **New migrations** to automate ingestion.
4. **Higher database plan** when quota is insufficient.
5. **Higher hosting plan** if traffic justifies it.

## References

- [Deployment](./08-deployment.md) — first deployment.
- [Security & access §8](./04-security.md#8-activity-log-and-revert) — audit and revert.
