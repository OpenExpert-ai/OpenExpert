# 14 · Roadmap

Status of implemented and pending items.

## Implemented

| Element                                                     | Document                                 |
| ----------------------------------------------------------- | ---------------------------------------- |
| Local-first, single-owner edition (no cloud)                | [Architecture](./02-architecture.md)     |
| SQLite persistence with Drizzle schema                      | [Data model](./03-data-model.md)         |
| Chat with tools, per-Expert isolation, visible reasoning    | [AI](./05-ai.md)                         |
| Confirmation cards for proposed actions                     | [AI](./05-ai.md)                         |
| Google Drive integration (optional)                         | [Integrations](./06-integrations.md)     |
| Local folders (optional, read + approved writes)            | [Integrations](./06-integrations.md)     |
| Notion (optional, OAuth 2.0, read + approved writes)        | [Integrations](./06-integrations.md)     |
| Audit log and revert                                        | [Security](./04-security.md)             |
| Prompt-injection pre-filter                                 | [Security](./04-security.md)             |
| Model providers: Ollama, Gemini, BYOK                       | [AI providers](./13-ai-providers.md)     |
| Engine and CLI (wizard, doctor, fix, models, serve, update) | [Engine and CLI](./11-engine-and-cli.md) |
| Docker image and `create-openexpert` scaffold               | [Quickstart](./00-quickstart.md)         |
| MIT license for the entire repository                       | [Licensing model](./12-licensing.md)     |
| Bilingual documentation (English / Spanish)                 | [Documentation](../README.md)            |
| CI, secret scanning, CodeQL, Scorecard                      | [Contributing](../../CONTRIBUTING.md)    |

## Pending

- [ ] **Remaining connectors** (Meta Ads, Gmail, Slack, Google Analytics,
      Salesforce). Pipedrive (deals), Holded (invoices) and CSV import are
      available as optional, pull-only data sources.
- [ ] **Broader autonomous processes.** A daily overdue-invoice report can run while the app is open. Other processes need real stage execution, scheduling and, when appropriate, approval.
- [ ] **Signed Windows and macOS installers.** CI builds unsigned `.msi`/`.dmg`;
      signing needs certificates.
- [ ] **Scheduled backups.** The passphrase-encrypted download is manual today.
