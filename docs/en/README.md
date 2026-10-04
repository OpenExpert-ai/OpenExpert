# OpenExpert documentation

This is the English-language documentation of OpenExpert. It is the **source of
truth**: when behaviour changes, update the documents here first, then mirror the
change to `../es/`.

## Table of contents

| N.º | Document                                 | Audience               | Content                                |
| --- | ---------------------------------------- | ---------------------- | -------------------------------------- |
| 00  | [Quickstart](./00-quickstart.md)         | All                    | From zero to chatting in 5 minutes     |
| 01  | [Product](./01-product.md)               | Business               | What the platform does, problem, scope |
| 02  | [Architecture](./02-architecture.md)     | Engineering            | Layers and data flow                   |
| 03  | [Data model](./03-data-model.md)         | Engineering + Business | SQLite tables                          |
| 04  | [Security & access](./04-security.md)    | Both                   | Access, isolation, secrets             |
| 05  | [AI](./05-ai.md)                         | Both                   | Assistant tools and limits             |
| 06  | [Integrations](./06-integrations.md)     | Both                   | Google Drive and connectors            |
| 07  | [Development](./07-development.md)       | Engineering            | Environment, scripts, conventions      |
| 08  | [Deployment](./08-deployment.md)         | Engineering            | Local run and Docker                   |
| 09  | [Operation & support](./09-operation.md) | Both                   | Tasks, diagnosis, backups              |
| 10  | [Glossary](./10-glossary.md)             | Business               | Vocabulary                             |
| 11  | [OpenCore](./11-opencore.md)             | All                    | The MIT engine and CLI                 |
| 12  | [Licensing model](./12-licensing.md)     | Both                   | MIT and obligations                    |
| 13  | [AI providers](./13-ai-providers.md)     | Both                   | Ollama, Gemini, BYOK                   |
| —   | [Roadmap](./roadmap.md)                  | Both                   | Status and planning                    |

## Conventions

- **Language:** English is the source of truth; Spanish lives in
  [`../es/`](../es/).
- **Identifiers:** technical identifiers always appear in `monospaced code`.

## Status

OpenExpert is a **local, single-owner** application. It runs on your machine with
SQLite; there is no cloud edition.
