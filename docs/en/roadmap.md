# Roadmap

Status of implemented and pending items.

## Implemented

| Element                                                              | Document                              |
| -------------------------------------------------------------------- | ------------------------------------- |
| Local-first, single-owner edition (no cloud)                         | [Architecture](./02-architecture.md)  |
| SQLite persistence with Drizzle schema                               | [Data model](./03-data-model.md)      |
| Chat with tools, per-Expert isolation, visible reasoning             | [AI](./05-ai.md)                      |
| Confirmation cards, including dual signature                         | [AI](./05-ai.md)                      |
| Google Drive integration (optional)                                  | [Integrations](./06-integrations.md)  |
| Audit log and revert                                                 | [Security](./04-security.md)          |
| Prompt-injection pre-filter                                          | [Security](./04-security.md)          |
| Model providers: Ollama, Gemini, BYOK                                | [AI providers](./13-ai-providers.md)  |
| OpenCore engine and CLI (wizard, doctor, fix, models, serve, update) | [OpenCore](./11-opencore.md)          |
| Docker image and `create-openexpert` scaffold                        | [Quickstart](./00-quickstart.md)      |
| MIT license for the entire repository                                | [Licensing model](./12-licensing.md)  |
| Bilingual documentation (English / Spanish)                          | [Documentation](../README.md)         |
| CI, secret scanning, CodeQL, Scorecard                               | [Contributing](../../CONTRIBUTING.md) |

## Pending

- [ ] **More connectors** (Pipedrive, Holded, Meta Ads, Gmail, Slack, Google
      Analytics). The data tables exist; the connectors are pending.
- [ ] **Effective process triggers.** The `trigger` field is descriptive; there
      is no scheduler yet.
- [ ] **Automatic ingestion** of the business tables.
- [ ] **Backup helper** for `OPENEXPERT_DATA_DIR`.
