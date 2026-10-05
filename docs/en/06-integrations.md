# 06 · Integrations

> **Audience:** both.

---

## 1. Status

Only **Google Drive** is connected, and it is optional. The other connectors are
modelled in the data but pending credentials.

| Integration      | Category      | Connection     | Status        |
| ---------------- | ------------- | -------------- | ------------- |
| **Google Drive** | Productivity  | OAuth + Picker | **Available** |
| Pipedrive        | CRM           | By licence     | Pending       |
| Salesforce       | CRM           | By licence     | Pending       |
| Holded           | ERP / Finance | By licence     | Pending       |
| Gmail            | Productivity  | API            | Pending       |
| Slack            | Productivity  | API            | Pending       |
| Google Analytics | Advertising   | API            | Pending       |
| Meta Ads         | Advertising   | Token          | Pending       |

## 2. Google Drive

The OAuth client is **baked into the build** (a shared client owned by the
distributor). End users **do not touch Google Cloud**.

### 2.1 Flow

1. **Integraciones → Fuentes** → `Conectar mi cuenta`.
2. A disclosure dialog explains the scope, where it flows and what the model
   provider sees. Click `Entiendo y conecto` to continue.
3. Google asks for `drive.file` and redirects to
   `http://localhost:3000/auth/google/callback` with a code + PKCE verifier.
4. The callback verifies the HMAC-signed `state`, exchanges the code with the
   verifier and stores the encrypted tokens in `~/.openexpert/credentials.json`.
5. **Integraciones → Fuentes** → `Seleccionar archivos` opens the Google Picker
   so you grant OpenExpert access to specific files.
6. The granted list lives encrypted in `~/.openexpert/drive-grants.json`. The
   chat can search/read/create/edit only within that list.

### 2.2 Scopes

| Scope        | Purpose                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------ |
| `drive.file` | Per-file access (non-sensitive). No CASA required. The user selects files with the Picker. |

### 2.3 Keys (filled by the distributor, never by end users)

| Variable / secret                                  | Purpose                                               | Where it lives                               |
| -------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| `OPENEXPERT_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` | OAuth client id (public)                              | env, `openexpert.json` or `secrets.json`     |
| `GOOGLE_CLIENT_SECRET`                             | OAuth client secret                                   | env or `secrets.json` (mode `0600`)          |
| `GOOGLE_PICKER_API_KEY`                            | Google Picker API key (HTTP-referrer-restricted)      | env or `secrets.json`                        |
| `GOOGLE_PICKER_APP_ID`                             | Cloud project number (public)                         | env                                          |
| `OPENEXPERT_PRIVACY_URL`                           | URL of the privacy policy shown in the consent dialog | env; default points to the repo `PRIVACY.md` |

### 2.4 Consent screen

Publish the OAuth consent screen in production so refresh tokens do not
expire after 7 days. See the
[Google Cloud OAuth verification FAQ](https://support.google.com/cloud/answer/9110914)
for the process. `drive.file` is non-sensitive — the audit / CASA is **not
required**.

### 2.5 Consent, privacy and Limited Use

In-product disclosure is shown before connecting. The Limited Use statement
required by Google's User Data Policy is included in
[`PRIVACY.md`](../../PRIVACY.md) (English) and
[`docs/es/POLITICA-DE-PRIVACIDAD.md`](../es/POLITICA-DE-PRIVACIDAD.md) (Spanish).
A copy is shown in the Connect dialog. The URL is configurable via
`OPENEXPERT_PRIVACY_URL`.

## 3. AI tools

| Tool                | Behaviour                                      |
| ------------------- | ---------------------------------------------- |
| `search_drive`      | Searches the granted files only                |
| `read_drive_file`   | Reads only within the grants                   |
| `create_drive_file` | Creates a new file the app owns                |
| `update_drive_file` | Edits a granted file or a file the app created |

All read tools require `gdrive` in the Expert's `sources`. All writes go
through human approval.

## 4. Security notes

- Tokens and grants are **AES-256-GCM encrypted** with a key file generated
  on the local machine (`~/.openexpert/secret.key`, mode `0600`).
- OAuth `state` includes a PKCE verifier signed with an HMAC of the
  nonce + verifier; the secret lives in `~/.openexpert/state-secret` (or
  `GOOGLE_OAUTH_STATE_SECRET`).
- The browser is trusted in the local single-owner edition (see
  [`04-security.md`](./04-security.md)).

## 5. Adding a new integration

1. **Credentials.** Document the OAuth flow or plan requirements.
2. **Tokens.** Reuse the Drive pattern (encrypted local file, `0600`).
3. **API client.** A server module using the owner's credentials.
4. **Sync.** A function that populates the destination table and updates status.
5. **AI tools.** Read functions with domain check, scope check, and source
   logging. Always include an in-product disclosure if user data is sent to
   a model provider.

## 6. References

- [Architecture](./02-architecture.md) — layers.
- [AI](./05-ai.md) — tool catalogue.
- [Security & access](./04-security.md) — secrets.
- [PRIVACY.md](../../PRIVACY.md) — privacy policy.
