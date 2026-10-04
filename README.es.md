# OpenExpert

Panel de operaciones con inteligencia artificial: Expertos con
aislamiento de datos, integraciones, chat con herramientas, procesos
con aprobación humana y registro auditable. El proyecto es **open source
bajo licencia MIT**.

OpenCore, la edición local descargable, se describe en
[`docs/es/11-opencore.md`](./docs/es/11-opencore.md).

> The English version of this document is [`README.md`](./README.md).

## Arranque rápido

```sh
npm ci
cp .env.example .env    # completar las variables
npm run dev             # http://localhost:3000
```

El servidor de desarrollo está fijado al **puerto 3000** porque las URI
de redirección OAuth dependen de él.

Edición local (sin Supabase):

```sh
cp openexpert.json.example openexpert.json
OPENEXPERT_MODE=local npm run dev
```

O bien con el CLI de OpenCore publicado:

```sh
npx @openexpert/opencore serve
```

## Documentación

Toda la documentación vive en **[`docs/`](./docs/README.md)**. El índice
indica el destinatario de cada documento y el idioma.

| Documento                                               | Contenido                                        |
| ------------------------------------------------------- | ------------------------------------------------ |
| [Producto (es)](./docs/es/01-producto.md)               | Descripción, problema, funcionalidad y alcance   |
| [Product (en)](./docs/en/01-product.md)                 | Description, problem, features and scope         |
| [Arquitectura (es)](./docs/es/02-arquitectura.md)       | Capas, flujo de datos y decisiones de diseño     |
| [Architecture (en)](./docs/en/02-architecture.md)       | Layers, data flow, design decisions              |
| [Modelo de datos (es)](./docs/es/03-modelo-de-datos.md) | Tablas, relaciones, RLS, triggers y migraciones  |
| [Data model (en)](./docs/en/03-data-model.md)           | Tables, relationships, RLS, triggers, migrations |
| [Seguridad (es)](./docs/es/04-seguridad-y-acceso.md)    | Roles, permisos, aislamiento y auditoría         |
| [Security (en)](./docs/en/04-security.md)               | Roles, permissions, isolation, audit             |
| [IA (es)](./docs/es/05-inteligencia-artificial.md)      | Herramientas del asistente y sus límites         |
| [AI (en)](./docs/en/05-ai.md)                           | Assistant tools and limits                       |
| [Integraciones (es)](./docs/es/06-integraciones.md)     | Estado de cada conector y su incorporación       |
| [Integrations (en)](./docs/en/06-integrations.md)       | Status of each connector and onboarding          |
| [Desarrollo (es)](./docs/es/07-desarrollo.md)           | Entorno local, scripts y convenciones            |
| [Development (en)](./docs/en/07-development.md)         | Local environment, scripts, conventions          |
| [Despliegue (es)](./docs/es/08-despliegue.md)           | Publicación en producción y configuración        |
| [Deployment (en)](./docs/en/08-deployment.md)           | Production deploy and domain configuration       |
| [Operación (es)](./docs/es/09-operacion-y-soporte.md)   | Costes, tareas periódicas y diagnóstico          |
| [Operation (en)](./docs/en/09-operation.md)             | Curency, recurring tasks, diagnosis              |
| [Glosario (es)](./docs/es/10-glosario.md)               | Definiciones del vocabulario técnico             |
| [Glossary (en)](./docs/en/10-glossary.md)               | Technical vocabulary                             |
| [OpenCore (es)](./docs/es/11-opencore.md)               | Motor MIT: modo local y alcance                  |
| [OpenCore (en)](./docs/en/11-opencore.md)               | MIT engine: local mode and scope                 |
| [Licencia (es)](./docs/es/12-licencia.md)               | Qué es abierto y qué se monetiza                 |
| [Licensing model (en)](./docs/en/12-licensing.md)       | What is open, what is monetised                  |
| [Hoja de ruta (es)](./docs/es/roadmap.md)               | Estado de implementación y planificación         |
| [Roadmap (en)](./docs/en/roadmap.md)                    | Implementation status and planning               |

## Stack

TanStack Start (React 19, SSR) · Tailwind CSS 4 + shadcn/ui ·
Supabase (PostgreSQL + RLS) con Drizzle como ejecutor de migraciones ·
Supabase Auth (Google OAuth) · Vercel AI SDK → Gemini, Ollama o la
pasarela OpenExpert · API de Google Drive por usuario · Vercel.

## Requisitos

- Node.js 20 o superior
- npm 10 o superior (gestor de paquetes oficial del proyecto)

## Estructura

```
vite.config.ts               Configuración de build
src/
  routes/          Rutas de TanStack Router
  lib/
    data.functions.ts       Server functions (puerta única de escritura)
    ee.server.ts            Autorización, auditoría y consultas de negocio
    ai/chat.server.ts       Chat con herramientas y control anti-inyección
    drive.server.ts         Cliente de Google Drive API (por usuario)
    drive-tokens.server.ts  OAuth de Drive y renovación de tokens
    opencore/               Adaptadores del modo local (paquete @openexpert/opencore)
  integrations/supabase/    Cliente web, cliente administrativo y sesión
packages/opencore/          Núcleo local MIT (publicado en npm)
docker/                      Dockerfile y docker-compose de la edición local
drizzle/migrations/         Migraciones SQL del esquema
docs/{en,es}/                Documentación bilingüe
```

## Notas

- El acceso está restringido a cuentas autorizadas mediante invitación.
  La primera cuenta registrada adquiere el rol `ADMIN`.
- `.env` está excluido del control de versiones; `.env.example`
  documenta cada variable.
- El repositorio entero se distribuye bajo la **Licencia MIT**.
  Ver [`LICENSE`](./LICENSE) y [`NOTICE`](./NOTICE).
- `SECURITY.md` describe el canal privado para reportar
  vulnerabilidades.
- `CONTRIBUTING.md` explica cómo contribuir.
