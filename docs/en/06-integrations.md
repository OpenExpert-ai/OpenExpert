# 06 · Integrations

> **Audience:** both.

---

## 1. Status

Only **Google Drive**, **local folders** and **Notion** are available, and all are
optional. The other connectors are modelled in the data but pending credentials.

| Integration      | Category      | Connection     | Status        |
| ---------------- | ------------- | -------------- | ------------- |
| **Google Drive** | Productivity  | OAuth + Picker | **Available** |
| **Local files**  | Productivity  | Local server   | **Available** |
| **Notion**       | Productivity  | OAuth 2.0      | **Available** |
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

## 3. Notion

Notion uses a **public connection (OAuth 2.0)**. The distributor bakes a shared
Notion client, so the end user only clicks `Conectar Notion` and picks pages in
Notion's own picker — no API keys to configure.

1. **Integraciones → Fuentes → Notion** → `Conectar Notion`.
2. Notion shows the connection capabilities and its page picker; the user chooses
   which pages/databases OpenExpert may access.
3. Notion redirects to `http://localhost:3000/auth/notion/callback` with a code.
4. The callback verifies the HMAC-signed `state`, exchanges the code
   (`POST /v1/oauth/token`, HTTP Basic) and stores the **long-lived** token
   encrypted in `~/.openexpert/notion.json` (`0600`). Notion has no refresh token.

### 3.1 Distributor setup (once)

1. In the [Notion developer portal](https://www.notion.so/profile/integrations),
   create a **public connection** (see the
   [public connections guide](https://developers.notion.com/guides/get-started/public-connections)).
2. Redirect URI: `http://localhost:3000/auth/notion/callback`.
3. [Capabilities](https://developers.notion.com/reference/capabilities): read
   content, insert content, update content, read user info without email.
4. Installation scope: _Any workspace_ (for distribution) or _Selected
   workspaces_ (for testing).
5. Copy the **client ID** and **client secret** from the Configuration tab.
6. Put the client ID in `openexpert.json` (`notionClientId`) and the secret in
   `~/.openexpert/secrets.json` as `NOTION_CLIENT_SECRET` (`0600`) — or set both
   as environment variables. Then the end user only clicks `Conectar Notion`.

Each end user authorizes the connection **in their own workspace** (`owner=user`)
and gets their own token, stored locally. The distributor's client is only the
**app identity**: there is no distributor server and no shared data token, so the
distributor never sees a user's token or content. The installation scope must be
_Any workspace_ so any user can install it.

The API version is pinned with the `Notion-Version` header (`2026-03-11`); the
rate limit is ~3 requests/second and `Retry-After` is respected. A Notion
security review is only required to be listed on the Notion Marketplace —
**not** to use the connection.

## 4. Local folders

The assistant can read and write files in **folders on the same machine**,
without Google. Pick them in **Integraciones → Fuentes → Archivos locales**,
either with the built-in folder navigator or by typing an absolute path. The
grants live encrypted in `~/.openexpert/local-roots.json`.

- Access is **only inside the granted folders**. Every path is resolved with
  `realpath` and checked against the roots, so symlink escapes are rejected.
- Reads return text, PDF text and Office content (Word `.docx`, Excel `.xlsx`,
  PowerPoint `.pptx`, OpenDocument). Writes (`create_local_file`,
  `update_local_file`) require **human approval**, like Drive writes.
- Bounded: 25 MB per file, 200k characters returned, 5,000 files and depth 8 per
  listing; `.git`, `node_modules`, dotfiles and secret files are skipped.
- Docker: the server sees the container filesystem, so mount the folder with
  `-v /host/folder:/data/folder`.

## 5. AI tools

| Tool                                                                 | Behaviour                                      |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| `search_drive`                                                       | Searches the granted files only                |
| `read_drive_file`                                                    | Reads only within the grants                   |
| `create_drive_file`                                                  | Creates a new file the app owns                |
| `update_drive_file`                                                  | Edits a granted file or a file the app created |
| `list_local_files` / `search_local_files`                            | Lists/searches the granted local folders       |
| `read_local_file`                                                    | Reads a granted local file                     |
| `create_local_file` / `update_local_file`                            | Writes a local file, with human approval       |
| `search_notion` / `query_notion_database` / `read_notion_page`       | Reads the shared Notion content                |
| `create_notion_page` / `update_notion_page` / `append_notion_blocks` | Writes to Notion, with human approval          |

Drive reads require `gdrive` in the Expert's `sources`; local reads require
`local`; Notion reads require `notion`. All writes go through human approval.

## 6. Security notes

- Tokens and grants are **AES-256-GCM encrypted** with a key file generated
  on the local machine (`~/.openexpert/secret.key`, mode `0600`).
- OAuth `state` includes a PKCE verifier signed with an HMAC of the
  nonce + verifier; the secret lives in `~/.openexpert/state-secret` (or
  `GOOGLE_OAUTH_STATE_SECRET`).
- Notion's long-lived token lives in `~/.openexpert/notion.json` (`0600`,
  AES-256-GCM); its `state` is HMAC-signed with `~/.openexpert/state-secret-notion`.
- Local folder access is restricted to the granted roots (see
  [`04-security.md`](./04-security.md)).
- The browser is trusted in the local single-owner edition (see
  [`04-security.md`](./04-security.md)).

## 7. Adding a new integration

1. **Credentials.** Document the OAuth flow or plan requirements.
2. **Tokens.** Reuse the Drive pattern (encrypted local file, `0600`).
3. **API client.** A server module using the owner's credentials.
4. **Sync.** A function that populates the destination table and updates status.
5. **AI tools.** Read functions with domain check, scope check, and source
   logging. Always include an in-product disclosure if user data is sent to
   a model provider.

## 8. References

- [Architecture](./02-architecture.md) — layers.
- [AI](./05-ai.md) — tool catalogue.
- [Security & access](./04-security.md) — secrets.
- [PRIVACY.md](../../PRIVACY.md) — privacy policy.
