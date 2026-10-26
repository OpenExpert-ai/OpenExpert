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
- [ ] **Autonomous processes (removed, to be rebuilt).** The old catalogue was
      scaffolding: "running" a process only incremented a counter, the trigger
      was descriptive (no scheduler) and the stages were never executed. It has
      been removed until it can be built for real: actual stage execution, a
      scheduler and, when needed, double-signature approval.
- [ ] **Signed Windows and macOS installers.** CI builds unsigned `.msi`/`.dmg`;
      signing needs certificates.
- [ ] **Scheduled backups.** The passphrase-encrypted download is manual today.
