# OpenExpert — Privacy Policy

> **Spanish version:** [`docs/es/POLITICA-DE-PRIVACIDAD.md`](./docs/es/POLITICA-DE-PRIVACIDAD.md)
> **Mirror:** [`docs/en/PRIVACY.md`](./docs/en/PRIVACY.md)

OpenExpert is a local-first operations dashboard for a single owner. It runs
entirely on your machine and your data stays there by default. This policy
explains what data OpenExpert accesses, stores, and, when you explicitly
opt in to a cloud service, transmits.

## 1. Data we do **not** collect

- No telemetry, analytics, cookies or tracking pixels.
- No servers in OpenExpert. There is no hosted edition.
- No user accounts. There is no login.

## 2. What lives on your machine (`~/.openexpert/`)

All the data below stays on your computer and never reaches OpenExpert or any
third party unless you configure a cloud integration explicitly.

| Data                                     | Purpose                                                                                | Lifetime                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `openexpert.db` (SQLite)                 | Your workspace, Experts, integrations, invoices, campaigns, chat history, activity log | Until you delete it (`Configuración → Datos → Restaurar`)                    |
| `openexpert.json`                        | Your non-secret preferences (model, sampling, chat limits, Google OAuth client id)     | Editable from the app or by hand                                             |
| `secrets.json` (mode `0600`)             | API keys (Gemini, OpenAI-compatible, etc.)                                             | Stored encrypted at rest, never sent by OpenExpert                           |
| `credentials.json` (mode `0600`)         | Google Drive OAuth tokens                                                              | Stored encrypted at rest, used only to call Google APIs with your consent    |
| `state-secret` (mode `0600`)             | HMAC key used to sign the OAuth `state` parameter                                      | Generated once on your machine                                               |
| Picker grants (`drive-grants.json`)      | The list of files you chose to share with OpenExpert                                   | Until you revoke them (`Integraciones → Fuentes`)                            |
| Local folder grants (`local-roots.json`) | The folders you granted OpenExpert access to                                           | Until you revoke them (`Integraciones → Fuentes`)                            |
| Notion token (`notion.json`)             | Notion OAuth token                                                                     | Stored encrypted at rest, used only to call the Notion API with your consent |

## 3. The AI model

OpenExpert lets you pick the model provider.

- **Default and recommended: Ollama.** Runs locally. **Your prompts and the
  content of files you choose from Google Drive, local folders and Notion never
  leave your machine.**
- **Optional: Google Gemini or any OpenAI-compatible endpoint.** You provide
  your own key. In that case, the **text of the conversation and the
  content of the files you chose from Google Drive, local folders and Notion are
  sent to that provider** so it can answer. OpenExpert is not party to those
  messages.

OpenExpert does **not** use any of this data to train, fine-tune or improve a
model. The third-party model providers have their own terms
([Gemini API Terms](https://ai.google.dev/terms),
[Google's Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai)).

## 4. Google Drive (optional)

OpenExpert connects to Google Drive only if you choose to.

- **What it asks for.** OpenExpert uses the **minimum scope**
  `https://www.googleapis.com/auth/drive.file`. This is a non-sensitive
  scope: it gives OpenExpert access only to the files **you select with the
  Google Picker**, and to the files it creates on your behalf. It cannot
  read or list the rest of your Drive.
- **What it does.** Search, summarise, create and edit the files you picked
  through the Google Picker or that OpenExpert created for you.
- **What it does not do.** It does not read, index or transmit the rest of
  your Drive. It does not use Drive as storage for OpenExpert's own data.
- **Human approval.** Every write (create / edit / delete) is proposed by the
  assistant and shown to you as a confirmation card. Nothing changes until
  you click Approve.
- **How to disconnect.** `Integraciones → Fuentes → Desconectar`. We also
  revoke the refresh token server-side at Google.

### Limited Use acknowledgement

> _The use of information received from Google Workspace scopes will adhere to
> the Google User Data Policy, including the Limited Use requirements._

Concretely:

- Data is used only to provide the user-facing features visible in OpenExpert
  (the chat, the source list, the audit log).
- No transfer to advertising platforms, no resale, no credit-scoring, no
  model training of non-personalised models.
- Humans do not read your files, unless you ask for support and grant
  explicit, additional consent for the specific file.

## 5. Backups

Backups (`GET /api/backup`) bundle the database, `openexpert.json`,
`secrets.json` and `credentials.json` into one JSON file on **your machine**.
They never leave it. Cross-origin downloads are rejected by the server.

## 6. Activity log and revert

OpenExpert records a local activity log of every change and exposes a
_Revert_ action that restores them. You can wipe the chat history and reset
the workspace from `Configuración → Datos`.

## 7. Children

OpenExpert is a general-audience business tool. It is not directed at
children under the age of 13.

## 8. Security incidents

If you suspect a security incident involving Google user data, please report
the data to `security@google.com` per the
[Google Workspace User Data and Developer Policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy),
and to the OpenExpert maintainers at the security channel listed in
[`SECURITY.md`](./SECURITY.md).

## 9. Changes to this policy

Material changes will be described in [`CHANGELOG.md`](./CHANGELOG.md). The
canonical version is this file in the repository; mirrors may lag.

## 10. License

OpenExpert is distributed under the
[MIT License](./LICENSE). This policy is informational; it does not create
any contractual obligation beyond what your jurisdiction requires.
