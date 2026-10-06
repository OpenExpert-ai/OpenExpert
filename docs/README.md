# Documentation

OpenExpert is documented in two languages. Pick yours:

- 🇬🇧 **[English documentation](./en/)** — primary, kept current.
- 🇪🇸 **[Documentación en español](./es/)** — content mirrored.

## Top-level documents

| N.º | English                                      | Español                                                       | Audience               |
| --- | -------------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| 00  | [Quickstart](./en/00-quickstart.md)          | [Inicio rápido](./es/00-inicio-rapido.md)                     | All                    |
| 01  | [Product](./en/01-product.md)                | [Producto](./es/01-producto.md)                               | Business               |
| 02  | [Architecture](./en/02-architecture.md)      | [Arquitectura](./es/02-arquitectura.md)                       | Engineering            |
| 03  | [Data model](./en/03-data-model.md)          | [Modelo de datos](./es/03-modelo-de-datos.md)                 | Engineering + Business |
| 04  | [Security & access](./en/04-security.md)     | [Seguridad y acceso](./es/04-seguridad-y-acceso.md)           | Both                   |
| 05  | [AI](./en/05-ai.md)                          | [Inteligencia artificial](./es/05-inteligencia-artificial.md) | Both                   |
| 06  | [Integrations](./en/06-integrations.md)      | [Integraciones](./es/06-integraciones.md)                     | Both                   |
| 07  | [Development](./en/07-development.md)        | [Desarrollo](./es/07-desarrollo.md)                           | Engineering            |
| 08  | [Deployment](./en/08-deployment.md)          | [Despliegue](./es/08-despliegue.md)                           | Engineering            |
| 09  | [Operation & support](./en/09-operation.md)  | [Operación y soporte](./es/09-operacion-y-soporte.md)         | Both                   |
| 10  | [Glossary](./en/10-glossary.md)              | [Glosario](./es/10-glosario.md)                               | Business               |
| 11  | [OpenCore](./en/11-opencore.md)              | [OpenCore](./es/11-opencore.md)                               | All                    |
| 12  | [Licensing model](./en/12-licensing.md)      | [Modelo de licencia](./es/12-licencia.md)                     | Both                   |
| 13  | [AI providers](./en/13-ai-providers.md)      | [Proveedores de IA](./es/13-proveedores-ia.md)                | Both                   |
| —   | [Roadmap](./en/roadmap.md)                   | [Hoja de ruta](./es/roadmap.md)                               | Both                   |
| —   | [Architecture decisions](./en/adr/README.md) | [Decisiones de arquitectura](./es/adr/README.md)              | Engineering            |

## Companion files

| File                                            | Purpose                                                  |
| ----------------------------------------------- | -------------------------------------------------------- |
| [`README.md`](../README.md)                     | Top-level project entry point (English).                 |
| [`README.es.md`](../README.es.md)               | Top-level project entry point (Spanish).                 |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md)         | How to contribute, DCO and release process.              |
| [`SECURITY.md`](../SECURITY.md)                 | Private vulnerability reporting and secret hygiene.      |
| [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)   | Community standards.                                     |
| [`GOVERNANCE.md`](../GOVERNANCE.md)             | Roles, decisions and releases.                           |
| [`LICENSE`](../LICENSE) / [`NOTICE`](../NOTICE) | License and third-party attributions.                    |
| [`CHANGELOG.md`](../CHANGELOG.md)               | Released changes.                                        |
| [`AGENTS.md`](../AGENTS.md)                     | Operational rules for AI assistants working on the repo. |
| [`STYLE.md`](./STYLE.md)                        | Documentation style guide.                               |
| [`.env.example`](../.env.example)               | Documented environment variables.                        |

## Conventions

- The English documentation is the source of truth. When behaviour changes,
  update the English version first, then mirror it to Spanish.
- Identifiers (table names, columns, env vars, paths) are always in monospaced
  code.
