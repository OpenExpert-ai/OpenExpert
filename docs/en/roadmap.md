# Roadmap

Status of implemented and pending items. Each row links to the document
with the detail.

## Implemented

| Element                                                            | Document                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Own infrastructure, no intermediaries in the build process         | [Architecture §7](./02-architecture.md#7-excluded-by-design)            |
| Google sign-in, restricted to authorised accounts                  | [Security §1](./04-security.md#1-who-can-sign-in)                       |
| Chat with tools, per-Expert isolation, visible reasoning           | [AI §2](./05-ai.md#2-tool-catalog)                                      |
| Confirmation cards, including dual sign.                           | [AI §2.3](./05-ai.md#23-proposal-tools-do-not-execute)                  |
| Google Drive integration: search, read, create and edit            | [Integrations §2](./06-integrations.md#2-google-drive-how-it-works)     |
| Governance: roles, per-Expert permissions, activity log, revert    | [Security §2, §3, §8](./04-security.md)                                 |
| Detection and logging of evasion attempts                          | [Security §5](./04-security.md#5-guarantees-against-assistant-misuse)   |
| Removal of business demo data                                      | —                                                                       |
| Removal of `reset_demo` and "Reset demo" control                   | [Data model §7](./03-data-model.md#7-migrations)                        |
| Removal of the previous data model                                 | [Data model §4](./03-data-model.md#4-removed-tables-previous-model)     |
| OpenCore local edition (MIT): local mode, BYOK, Ollama and gateway | [OpenCore](./11-opencore.md)                                            |
| MIT license for the entire repository                              | [Licensing model](./12-licensing.md)                                    |
| Bilingual documentation (English / Spanish)                        | [Documentation](../README.md)                                           |
| CI, secret scanning, dependency updates                            | [Contributing](../../CONTRIBUTING.md)                                   |
| Releases via Changesets and npm Trusted Publishing                 | [Releasing](../../.github/workflows/release.yml)                        |
| Docker image for the local edition                                 | [Deployment §7](./08-deployment.md#7-local-mode-opencore-no-deployment) |

## Pending

Ordered by value/effort ratio.

### No external cost, high value

- [ ] **Google Drive connection for the pending members.** The
      `google_tokens` table stores tokens per user.
- [ ] **Email invitations.** Today the invitation is created in the
      app and communicated by an external channel.

### Requires client credentials

- [ ] **Pipedrive** — CRM. The `ventas` tools are implemented and
      operate when data is present.
- [ ] **Holded** — ERP. Enables the `finanzas` tools and the overdue
      invoice follow-up.
- [ ] **Meta Ads** — Advertising. Enables CPA-vs-target analysis and
      campaign pause proposals.
- [ ] **Google Analytics** — Analytics. Complements Meta Ads.
- [ ] **Slack** — Process notifications and alerts.
- [ ] **Gmail** — Effective sending of collection reminders. Today
      logged without sending.
- [ ] **Salesforce** — CRM. Requires a prior evaluation of its
      contribution vs Pipedrive.

### Pending automation

- [ ] **Effective process triggers.** The `trigger` field is currently
      descriptive; there is no execution scheduler.
- [ ] **Automatic ingestion of the business tables.** `deals`,
      `invoices`, `campaigns` and `accounts` are meant to be fed by
      the corresponding integrations.

### Pending deployment

- [ ] **First production deployment** and domain registration at the
      three points described in
      [08-deployment §3](./08-deployment.md#3-registering-the-domain-in-three-systems).
- [ ] **Backup plan.** See [08-deployment §6](./08-deployment.md#6-updates-revert-and-backups).
