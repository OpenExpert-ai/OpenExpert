# OpenExpert

Operations dashboard with artificial intelligence: Experts with strict
data isolation, integrations, a tool-using chat, human-approved
processes, and a complete audit trail. The project is **open source
under the MIT license**.

OpenCore, the downloadable local edition, is described in
[`docs/en/11-opencore.md`](./docs/en/11-opencore.md).

> La versión en español de este documento está en
> [`README.es.md`](./README.es.md).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](https://nodejs.org)
[![npm workspaces](https://img.shields.io/badge/npm-workspaces-CB3837)](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
[![CodeQL](https://github.com/OpenExpert/OpenExpert/actions/workflows/codeql.yml/badge.svg)](.github/workflows/codeql.yml)
[![Scorecard](https://img.shields.io/openssf-scorecard/github/OpenExpert/OpenExpert)](https://scorecard.dev/viewer/?uri=github.com/OpenExpert/OpenExpert)
[![Changesets](https://img.shields.io/badge/changesets-ready-orange)](https://github.com/changesets/changesets)

## Quick start

Pick the path that fits you. Full guide:
[docs/en/00-quickstart.md](./docs/en/00-quickstart.md).

### Local edition (OpenCore) — no cloud

Docker (no Node needed):

```sh
docker run --rm -p 3000:3000 -v openexpert-data:/data ghcr.io/openexpert/openexpert:local
# or bring Ollama along:
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

With Node:

```sh
npx @openexpert/opencore          # interactive setup, then starts
npx @openexpert/opencore serve    # start directly
```

Scaffold a project:

```sh
npm create openexpert my-app && cd my-app && docker compose up -d
```

### From source (cloud or local)

```sh
npm ci
cp .env.example .env            # cloud: fill in the variables
npm run dev                     # http://localhost:3000 (cloud)
npm run dev:local               # local edition, no Supabase
```

The dev server is pinned to **port 3000** because the OAuth redirect
URIs depend on it.

## Documentation

The full documentation lives in **[`docs/`](./docs/README.md)**. The
index declares the audience for each document and the language.

| Document                                                | Content                                          |
| ------------------------------------------------------- | ------------------------------------------------ |
| [Product (en)](./docs/en/01-product.md)                 | Description, problem, features, scope            |
| [Producto (es)](./docs/es/01-producto.md)               | Descripción, problema, funcionalidad, alcance    |
| [Architecture (en)](./docs/en/02-architecture.md)       | Layers, data flow, design decisions              |
| [Arquitectura (es)](./docs/es/02-arquitectura.md)       | Capas, flujo de datos, decisiones de diseño      |
| [Data model (en)](./docs/en/03-data-model.md)           | Tables, relationships, RLS, triggers, migrations |
| [Modelo de datos (es)](./docs/es/03-modelo-de-datos.md) | Tablas, relaciones, RLS, triggers, migraciones   |
| [Security (en)](./docs/en/04-security.md)               | Roles, permissions, isolation, audit             |
| [Seguridad (es)](./docs/es/04-seguridad-y-acceso.md)    | Roles, permisos, aislamiento, auditoría          |
| [AI (en)](./docs/en/05-ai.md)                           | Assistant tools and limits                       |
| [IA (es)](./docs/es/05-inteligencia-artificial.md)      | Herramientas del asistente y sus límites         |
| [Integrations (en)](./docs/en/06-integrations.md)       | Status of each connector and onboarding          |
| [Integraciones (es)](./docs/es/06-integraciones.md)     | Estado de cada conector e incorporación          |
| [Development (en)](./docs/en/07-development.md)         | Local environment, scripts, conventions          |
| [Desarrollo (es)](./docs/es/07-desarrollo.md)           | Entorno local, scripts, convenciones             |
| [Deployment (en)](./docs/en/08-deployment.md)           | Production deploy and domain configuration       |
| [Despliegue (es)](./docs/es/08-despliegue.md)           | Publicación en producción y configuración        |
| [Operation (en)](./docs/en/09-operation.md)             | Costs, recurring tasks, diagnosis                |
| [Operación (es)](./docs/es/09-operacion-y-soporte.md)   | Costes, tareas periódicas, diagnóstico           |
| [Glossary (en)](./docs/en/10-glossary.md)               | Technical vocabulary                             |
| [Glosario (es)](./docs/es/10-glosario.md)               | Definiciones del vocabulario técnico             |
| [OpenCore (en)](./docs/en/11-opencore.md)               | MIT engine: local mode and scope                 |
| [OpenCore (es)](./docs/es/11-opencore.md)               | Motor MIT: modo local y alcance                  |
| [Licensing model (en)](./docs/en/12-licensing.md)       | What is open, what is monetised                  |
| [Modelo de licencia (es)](./docs/es/12-licencia.md)     | Qué es abierto y qué se monetiza                 |
| [Roadmap (en)](./docs/en/roadmap.md)                    | Implementation status and planning               |
| [Hoja de ruta (es)](./docs/es/roadmap.md)               | Estado de implementación y planificación         |

## Stack

TanStack Start (React 19, SSR) · Tailwind CSS 4 + shadcn/ui ·
Supabase (PostgreSQL + RLS) with Drizzle as migration runner ·
Supabase Auth (Google OAuth) · Vercel AI SDK → Gemini, Ollama or the
OpenExpert gateway · per-user Google Drive API · Vercel.

## Requirements

- Node.js 20 or later
- npm 10 or later (the official package manager)

## Layout

```
vite.config.ts                Build configuration
src/
  routes/           TanStack Router routes
  lib/
    data.functions.ts        Server functions (single write path)
    ee.server.ts             Authorisation, audit, business queries
    ai/chat.server.ts        Chat with tools and injection guard
    drive.server.ts          Per-user Google Drive API client
    drive-tokens.server.ts   Drive OAuth and lifecycle
    opencore/                Local-mode adapters (@openexpert/opencore)
  integrations/supabase/     Browser client, admin client and session
packages/opencore/           MIT local core (published to npm)
docker/                      Dockerfile and docker-compose for the local edition
drizzle/migrations/          SQL migrations of the schema
docs/{en,es}/                Bilingual documentation
```

## Notes

- Access is restricted to invited accounts. The first registered account
  becomes `ADMIN`.
- `.env` is git-ignored; `.env.example` documents every variable.
- The whole repository is released under the **MIT License**. See
  [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
- [`SECURITY.md`](./SECURITY.md) describes the private channel for
  reporting vulnerabilities.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) explains how to contribute.
