# OpenExpert documentation

This is the English-language documentation of OpenExpert. It is the
**source of truth**: when behaviour changes, update the documents here
first, then mirror the change to `../es/`.

## Table of contents

| N.º | Document                                 | Audience               | Content                                          |
| --- | ---------------------------------------- | ---------------------- | ------------------------------------------------ |
| 00  | [Quickstart](./00-quickstart.md)         | All                    | From zero to chatting in 5 minutes               |
| 01  | [Product](./01-product.md)               | Business               | What the platform does, problem, features, scope |
| 02  | [Architecture](./02-architecture.md)     | Engineering            | Layers, components, request and chat flow        |
| 03  | [Data model](./03-data-model.md)         | Engineering + Business | Stored information and meaning of each table     |
| 04  | [Security & access](./04-security.md)    | Both                   | Access control, permissions, protections         |
| 05  | [AI](./05-ai.md)                         | Both                   | Assistant capabilities, data used, controls      |
| 06  | [Integrations](./06-integrations.md)     | Both                   | Status of each connector and how to onboard it   |
| 07  | [Development](./07-development.md)       | Engineering            | Environment, scripts, migrations, conventions    |
| 08  | [Deployment](./08-deployment.md)         | Engineering            | Production deploy and domain configuration       |
| 09  | [Operation & support](./09-operation.md) | Both                   | Recurring tasks, plan limits, incident diagnosis |
| 10  | [Glossary](./10-glossary.md)             | Business               | Technical vocabulary used in the application     |
| 11  | [OpenCore](./11-opencore.md)             | All                    | MIT-licensed engine: local mode and scope        |
| 12  | [Licensing model](./12-licensing.md)     | Both                   | What is open, what is monetised, obligations     |
| —   | [Roadmap](./roadmap.md)                  | Both                   | Implementation status and planning               |

## Conventions

- **Language:** English is the source of truth; Spanish content lives in
  [`../es/`](../es/) and mirrors it.
- **Audience:** each document states its primary audience at the top.
- **Identifiers:** technical identifiers (table names, columns, env vars,
  paths) always appear in `monospaced code`.

## Status

- **Edition:** cloud on Supabase (eu-west-1) and Vercel, plus the OpenCore
  local edition.
- **Maturity:** the application is navigable and functional. Only Google
  Drive is currently connected; the remaining connectors are declared and
  pending credentials. See [01-product §5](./01-product.md#5-current-scope).
