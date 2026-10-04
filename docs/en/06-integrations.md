# 06 · Integrations

> **Audience:** both.

---

## 1. Status

Only **Google Drive** is connected, and it is optional. The other connectors are
modelled in the data but pending credentials.

| Integration      | Category      | Connection | Status        |
| ---------------- | ------------- | ---------- | ------------- |
| **Google Drive** | Productivity  | OAuth      | **Available** |
| Pipedrive        | CRM           | By licence | Pending       |
| Salesforce       | CRM           | By licence | Pending       |
| Holded           | ERP / Finance | By licence | Pending       |
| Gmail            | Productivity  | OAuth      | Pending       |
| Slack            | Productivity  | OAuth      | Pending       |
| Google Analytics | Advertising   | OAuth      | Pending       |
| Meta Ads         | Advertising   | Token      | Pending       |

## 2. Google Drive

Each install connects the owner's Google account from _Integrations → Sources_.
There is no shared service account.

### 2.1 Flow

1. _Connect Google Drive_ builds a Google consent URL with a signed `state`.
2. Google redirects to `/auth/google/callback` with `code` and `state`.
3. The callback verifies the HMAC `state`, exchanges the code and stores the
   tokens in `~/.openexpert/credentials.json` (`0600`).

### 2.2 Scopes

| Scope            | Purpose               |
| ---------------- | --------------------- |
| `drive.readonly` | Search and read files |
| `drive.file`     | Create and edit files |

### 2.3 Consent status: "In production"

In **Testing**, Google caps the refresh token at 7 days. Leave the consent
screen **In production** so the token does not expire weekly.

## 3. Adding a new integration

1. **Credentials.** Document the OAuth flow or plan requirements.
2. **Tokens.** Reuse the Drive pattern (local file, `0600`).
3. **API client.** A server module using the owner's credentials.
4. **Sync.** A function that populates the destination table and updates status.
5. **AI tools.** Read functions with domain check and source logging.

## 4. References

- [Architecture](./02-architecture.md) — layers.
- [AI](./05-ai.md) — tool catalogue.
