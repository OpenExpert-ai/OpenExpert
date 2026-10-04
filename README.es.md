# OpenExpert

Panel de operaciones con inteligencia artificial que funciona **enteramente en
tu equipo**: Expertos con aislamiento de datos, integraciones, chat con
herramientas, procesos con aprobación humana y registro auditable. **Sin nube,
sin cuentas y sin servidor de base de datos**: solo SQLite y tu propio modelo.

El proyecto es **open source bajo licencia MIT**.

> The English version of this document is [`README.md`](./README.md).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](https://nodejs.org)

## Arranque rápido

Guía completa: [docs/es/00-inicio-rapido.md](./docs/es/00-inicio-rapido.md).

### Docker (sin Node)

```sh
docker run --rm -p 3000:3000 -v openexpert-data:/data ghcr.io/openexpert-ai/openexpert:local
# o con Ollama incluido:
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

### Con Node

```sh
npx @openexpert/opencore          # asistente, luego arranca
npx @openexpert/opencore serve    # arrancar directamente
```

O crea un proyecto:

```sh
npm create openexpert mi-app && cd mi-app && docker compose up -d
```

### Desde el código

```sh
git clone https://github.com/OpenExpert-ai/OpenExpert.git
cd OpenExpert
npm ci
npm run dev                       # http://localhost:3000
```

El servidor de desarrollo está fijado al **puerto 3000** porque la URI de
redirección OAuth de Google Drive depende de él.

## Cómo funciona

- **Datos** en un único fichero SQLite en `OPENEXPERT_DATA_DIR/openexpert.db`
  (por defecto `~/.openexpert/`). Nada sale de tu equipo.
- **IA** como configuración: [Ollama](https://ollama.com) (por defecto, sin
  claves), Google Gemini (clave gratuita) o cualquier endpoint
  OpenAI-compatible. Ver [docs/es/13-proveedores-ia.md](./docs/es/13-proveedores-ia.md).
- **Google Drive** es una integración opcional con tu propia cuenta; los tokens
  se guardan en local con permisos `0600`.
- **Gobierno**: cada cambio reversible se registra con snapshot y puede
  revertirse desde la pantalla de actividad. La IA solo _propone_ acciones y
  requieren aprobación humana.

## Documentación

Toda la documentación vive en **[`docs/`](./docs/README.md)** (inglés y español).

| Documento                                           | Contenido                             |
| --------------------------------------------------- | ------------------------------------- |
| [Inicio rápido](./docs/es/00-inicio-rapido.md)      | De cero a chatear en 5 minutos        |
| [Producto](./docs/es/01-producto.md)                | Qué hace la plataforma                |
| [Arquitectura](./docs/es/02-arquitectura.md)        | Capas y flujo de datos                |
| [Modelo de datos](./docs/es/03-modelo-de-datos.md)  | Tablas SQLite                         |
| [Seguridad](./docs/es/04-seguridad-y-acceso.md)     | Acceso y protecciones                 |
| [IA](./docs/es/05-inteligencia-artificial.md)       | Herramientas y límites                |
| [Integraciones](./docs/es/06-integraciones.md)      | Google Drive y cómo añadir conectores |
| [Desarrollo](./docs/es/07-desarrollo.md)            | Entorno, scripts, convenciones        |
| [Despliegue](./docs/es/08-despliegue.md)            | Ejecución local y Docker              |
| [Operación](./docs/es/09-operacion-y-soporte.md)    | Tareas periódicas y diagnóstico       |
| [Glosario](./docs/es/10-glosario.md)                | Vocabulario                           |
| [OpenCore](./docs/es/11-opencore.md)                | El motor y CLI MIT                    |
| [Modelo de licencia](./docs/es/12-licencia.md)      | MIT, obligaciones, monetización       |
| [Proveedores de IA](./docs/es/13-proveedores-ia.md) | Ollama, Gemini y BYOK                 |
| [Hoja de ruta](./docs/es/roadmap.md)                | Estado y planificación                |

## Requisitos

- Node.js 20 o superior
- npm 10 o superior (gestor de paquetes oficial)

## Estructura

```
vite.config.ts                Configuración de build (Nitro node-server)
src/
  routes/           Rutas de TanStack Router
  lib/
    db.server.ts             SQLite (sql.js) + esquema + semilla
    data.functions.ts        Server functions (puerta única de escritura)
    ee.server.ts             Auditoría, reversión y consultas de negocio
    ai/chat.server.ts        Chat con herramientas y control anti-inyección
    drive.server.ts          Cliente de Google Drive API
    drive-tokens.server.ts   OAuth de Drive y ciclo de vida de tokens
    opencore/                Proveedor de modelo + custodia local de credenciales
drizzle/schema.ts             Esquema SQLite tipado
drizzle/init.sql              DDL SQLite (aplicado al arrancar)
packages/opencore/            Motor MIT (modelo, config, herramientas, CLI)
docker/                       Dockerfile y docker-compose
docs/{en,es}/                 Documentación bilingüe
```

## Notas

- Propietario único: no hay login ni gestión multiusuario.
- `.env` está excluido del control de versiones; `.env.example` documenta cada
  variable.
- El repositorio entero se distribuye bajo la **Licencia MIT**. Ver
  [`LICENSE`](./LICENSE) y [`NOTICE`](./NOTICE).
- [`SECURITY.md`](./SECURITY.md) describe el canal privado para reportar
  vulnerabilidades.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) explica cómo contribuir.
