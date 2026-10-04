# OpenExpert

Operations dashboard with artificial intelligence that runs **entirely on your
machine**: Experts with strict data isolation, integrations, a tool-using chat,
human-approved processes, and a complete audit trail. **No cloud, no accounts,
no database server** — just SQLite and your own model.

The project is **open source under the MIT license**.

> La versión en español de este documento está en
> [`README.es.md`](./README.es.md).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](https://nodejs.org)
[![CodeQL](https://github.com/OpenExpert-ai/OpenExpert/actions/workflows/codeql.yml/badge.svg)](.github/workflows/codeql.yml)
[![Scorecard](https://img.shields.io/openssf-scorecard/github/OpenExpert-ai/OpenExpert)](https://scorecard.dev/viewer/?uri=github.com/OpenExpert-ai/OpenExpert)

## Quick start

Full guide: [docs/en/00-quickstart.md](./docs/en/00-quickstart.md).

### Docker (no Node required)

```sh
docker run --rm -p 3000:3000 -v openexpert-data:/data ghcr.io/openexpert-ai/openexpert:local
# or bring Ollama along:
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

### With Node

```sh
npx @openexpert/opencore          # interactive setup, then starts
npx @openexpert/opencore serve    # start directly
```

Scaffold a project:

```sh
npm create openexpert my-app && cd my-app && docker compose up -d
```

### From source

```sh
git clone https://github.com/OpenExpert-ai/OpenExpert.git
cd OpenExpert
npm ci
npm run dev                       # http://localhost:3000
```

The dev server is pinned to **port 3000** because the Google Drive OAuth
redirect URI depends on it.

## How it works

- **Data** lives in a single SQLite file at `OPENEXPERT_DATA_DIR/openexpert.db`
  (default `~/.openexpert/`). Nothing leaves your machine.
- **AI** is configuration: [Ollama](https://ollama.com) (default, no keys),
  Google Gemini (free API key) or any OpenAI-compatible endpoint. See
  [docs/en/13-ai-providers.md](./docs/en/13-ai-providers.md).
- **Google Drive** is an optional integration, connected with your own account;
  tokens are stored locally with mode `0600`.
- **Governance**: every revertible change is logged with a snapshot and can be
  reverted from the activity screen. AI actions are only _proposed_ and need
  human approval.

## Documentation

The full documentation lives in **[`docs/`](./docs/README.md)** (English and
Spanish).

| Document                                     | Content                                |
| -------------------------------------------- | -------------------------------------- |
| [Quickstart](./docs/en/00-quickstart.md)     | From zero to chatting in 5 minutes     |
| [Product](./docs/en/01-product.md)           | What the platform does                 |
| [Architecture](./docs/en/02-architecture.md) | Layers and data flow                   |
| [Data model](./docs/en/03-data-model.md)     | SQLite tables                          |
| [Security](./docs/en/04-security.md)         | Access and protections                 |
| [AI](./docs/en/05-ai.md)                     | Assistant tools and limits             |
| [Integrations](./docs/en/06-integrations.md) | Google Drive and how to add connectors |
| [Development](./docs/en/07-development.md)   | Environment, scripts, conventions      |
| [Deployment](./docs/en/08-deployment.md)     | Running locally and with Docker        |
| [Operation](./docs/en/09-operation.md)       | Recurring tasks and diagnosis          |
| [Glossary](./docs/en/10-glossary.md)         | Vocabulary                             |
| [OpenCore](./docs/en/11-opencore.md)         | The MIT engine and CLI                 |
| [Licensing model](./docs/en/12-licensing.md) | MIT, obligations, monetisation         |
| [AI providers](./docs/en/13-ai-providers.md) | Ollama, Gemini and BYOK                |
| [Roadmap](./docs/en/roadmap.md)              | Status and planning                    |

## Requirements

- Node.js 20 or later
- npm 10 or later (the official package manager)

## Layout

```
vite.config.ts                Build configuration (Nitro node-server)
src/
  routes/           TanStack Router routes
  lib/
    db.server.ts             SQLite (sql.js) + schema init + seed
    data.functions.ts        Server functions (single write path)
    ee.server.ts             Audit, revert and business queries
    ai/chat.server.ts        Chat with tools and injection guard
    drive.server.ts          Google Drive API client
    drive-tokens.server.ts   Drive OAuth and token lifecycle
    opencore/                Model provider + local credential custody
drizzle/schema.ts             Typed SQLite schema
drizzle/init.sql              SQLite DDL (applied at startup)
packages/opencore/            MIT engine (model provider, config, tools, CLI)
docker/                       Dockerfile and docker-compose
docs/{en,es}/                 Bilingual documentation
```

## Notes

- Single owner: there is no login and no multi-user management.
- `.env` is git-ignored; `.env.example` documents every variable.
- The whole repository is released under the **MIT License**. See
  [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
- [`SECURITY.md`](./SECURITY.md) describes the private channel for reporting
  vulnerabilities.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) explains how to contribute.
