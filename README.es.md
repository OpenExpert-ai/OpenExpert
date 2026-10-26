# OpenExpert

**Habla con tu empresa — con tus datos en tu equipo.**

OpenExpert es un panel de operaciones con IA local-first: Expertos con datos
aislados, un chat que usa herramientas y acciones que necesitan tu aprobación
antes de cambiar nada. Un solo fichero SQLite, tu propio modelo, sin cuentas y
sin servicio en la nube.

Funciona con Ollama por defecto. Si lo prefieres, puedes conectar Gemini, Claude
o cualquier endpoint compatible con OpenAI; la base de datos se queda local en
cualquier caso.

Open source bajo licencia MIT.

> La versión en inglés de este documento es [`README.md`](./README.md).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-339933)](https://nodejs.org)
[![npm](https://img.shields.io/npm/v/@openexpert/openexpert)](https://www.npmjs.com/package/@openexpert/openexpert)
[![Release](https://img.shields.io/github/v/release/OpenExpert-ai/OpenExpert)](https://github.com/OpenExpert-ai/OpenExpert/releases)
[![CodeQL](https://github.com/OpenExpert-ai/OpenExpert/actions/workflows/codeql.yml/badge.svg)](.github/workflows/codeql.yml)
[![Scorecard](https://img.shields.io/openssf-scorecard/github/OpenExpert-ai/OpenExpert)](https://scorecard.dev/viewer/?uri=github.com/OpenExpert-ai/OpenExpert)

![Pantalla de Expertos de OpenExpert: cuatro Expertos con dominios y fuentes aislados](docs/assets/readme-experts.png)

## Por qué OpenExpert

- **Aislamiento por diseño.** Cada Experto solo ve los dominios y las fuentes que
  tiene permitidos; ningún Experto puede leer los datos de otro.
- **Nada cambia sin ti.** El asistente propone, tú apruebas, y cada cambio
  reversible queda registrado con una instantánea y se puede revertir.
- **Local por defecto.** Un solo fichero SQLite, sin cuentas y sin servidor de
  base de datos. Ollama se ejecuta en tu equipo; Gemini, Claude o cualquier
  endpoint compatible con OpenAI son opcionales.

## Qué puedes preguntar

- «¿Cómo va el pipeline comercial?»
- «Reclama las facturas vencidas de más de 5.000 €.»
- «Pausa las campañas con un CPA alto.»
- «Crea un Experto nuevo para Operaciones.»

El asistente responde con los datos que conectes (Google Drive, carpetas locales
y Notion) o tu CRM y contabilidad (Pipedrive, Holded o un CSV) y propone las
escrituras en vez de ejecutarlas.

![Ajustes de IA de OpenExpert: Ollama seleccionado, con proveedores externos disponibles](docs/assets/readme-ai.png)

## Arranque rápido

Guía completa: [docs/es/00-inicio-rapido.md](./docs/es/00-inicio-rapido.md).

### Docker (sin Node)

La aplicación no tiene login: mantenla en `127.0.0.1` (ver [docker/README.md](./docker/README.md)).

```sh
docker run --rm -p 127.0.0.1:3000:3000 -v openexpert-data:/data ghcr.io/openexpert-ai/openexpert:latest
```

O, desde un clon, con Ollama incluido:

```sh
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

### Con Node

```sh
npx @openexpert/openexpert          # asistente, luego arranca
npx @openexpert/openexpert serve    # arrancar directamente
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

### Aplicación de escritorio (Linux)

OpenExpert también puede ejecutarse como una ventana nativa abierta con un único
comando, instalada para el usuario actual (requiere Rust y las librerías de
WebKitGTK 4.1; los paquetes por distribución están en
[Despliegue](./docs/es/08-despliegue.md)):

```sh
npm run desktop:install    # compila e instala el lanzador
openexpert                 # arranca el servidor y abre la ventana
```

O instala todo (dependencias, build, lanzador y entrada de menú) con un solo
comando:

```sh
./install.sh              # pregunta el proveedor; --with-ollama instala Ollama + llama3.1
```

Ver [Despliegue](./docs/es/08-despliegue.md).

## Cómo funciona

- **Datos** en un único fichero SQLite en `OPENEXPERT_DATA_DIR/openexpert.db`
  (por defecto `~/.openexpert/`). La base de datos nunca sale de tu equipo.
- **IA** como configuración: [Ollama](https://ollama.com) (por defecto, sin
  claves) se ejecuta en local; Google Gemini, Claude o cualquier endpoint
  compatible con OpenAI son opcionales. Con Ollama, los prompts tampoco salen;
  con un proveedor externo, el prompt va a ese proveedor. Ver
  [docs/es/13-proveedores-ia.md](./docs/es/13-proveedores-ia.md).
- **Fuentes** (opcional): Google Drive, carpetas locales y Notion, conectadas con
  tu propia cuenta; los tokens y las concesiones se guardan en local con permisos
  `0600`.
- **Datos de negocio**: importa un CSV (ventas, facturas, campañas o cuentas) o
  conecta Pipedrive y Holded con tu propia clave de API; los dos son opcionales.
  El juego de ejemplo de Ajustes → Datos permite probar el panel antes de conectar.
- **Gobierno**: cada cambio reversible se registra con una instantánea y puede
  revertirse desde la pantalla de actividad. La IA solo _propone_ acciones y
  requieren aprobación humana.
- **Configuración** en un panel (`/settings`): modelo e IA, chat, copias de
  seguridad, apariencia y opciones avanzadas — en español o inglés. Los cambios
  se aplican sin reiniciar.

## Documentación

Toda la documentación vive en **[`docs/`](./docs/README.md)** (inglés y español).

| Documento                                           | Contenido                               |
| --------------------------------------------------- | --------------------------------------- |
| [Inicio rápido](./docs/es/00-inicio-rapido.md)      | De cero a chatear en 5 minutos          |
| [Producto](./docs/es/01-producto.md)                | Qué hace la plataforma                  |
| [Arquitectura](./docs/es/02-arquitectura.md)        | Capas y flujo de datos                  |
| [Modelo de datos](./docs/es/03-modelo-de-datos.md)  | Tablas SQLite                           |
| [Seguridad](./docs/es/04-seguridad-y-acceso.md)     | Acceso y protecciones                   |
| [IA](./docs/es/05-inteligencia-artificial.md)       | Herramientas y límites                  |
| [Integraciones](./docs/es/06-integraciones.md)      | Google Drive, carpetas locales y Notion |
| [Desarrollo](./docs/es/07-desarrollo.md)            | Entorno, scripts, convenciones          |
| [Despliegue](./docs/es/08-despliegue.md)            | Ejecución local y Docker                |
| [Operación](./docs/es/09-operacion-y-soporte.md)    | Tareas periódicas y diagnóstico         |
| [Glosario](./docs/es/10-glosario.md)                | Vocabulario                             |
| [Motor y CLI](./docs/es/11-motor-y-cli.md)          | El paquete y su CLI (MIT)               |
| [Modelo de licencia](./docs/es/12-licencia.md)      | MIT, obligaciones, monetización         |
| [Proveedores de IA](./docs/es/13-proveedores-ia.md) | Ollama, Gemini y BYOK                   |
| [Hoja de ruta](./docs/es/14-hoja-de-ruta.md)        | Estado y planificación                  |

## Requisitos

- Node.js 24 o superior (incluye npm 11).
- Docker, opcional, para el camino del contenedor.
- Para la aplicación de escritorio: Rust y WebKitGTK 4.1 — ver
  [Despliegue](./docs/es/08-despliegue.md).

## Estructura

Las rutas que más se tocan:

```
src/routes/          Rutas de TanStack Router
src/lib/             server functions, SQLite, herramientas de IA, integraciones
packages/openexpert/ Motor MIT y CLI
docker/              Dockerfile y Compose
docs/{en,es}/        Documentación bilingüe
src-tauri/           Ventana de escritorio (Tauri)
```

El árbol completo está en [Desarrollo](./docs/es/07-desarrollo.md).

## Estado

OpenExpert está en **pre-1.0 (0.5.x)**. Las interfaces y el modelo de datos
pueden cambiar entre versiones menores. La
[hoja de ruta](./docs/es/14-hoja-de-ruta.md) cuenta lo que viene.

## Contribuir

Las issues y los pull requests son bienvenidos. [`CONTRIBUTING.md`](./CONTRIBUTING.md)
explica el DCO y las puertas; la puesta en marcha está en
[`docs/es/07-desarrollo.md`](./docs/es/07-desarrollo.md). El soporte es de
comunidad y no tiene SLA: ver [`SUPPORT.md`](./SUPPORT.md).

## Notas

- Propietario único: no hay login ni gestión multiusuario. Mantén el servidor en
  `127.0.0.1` salvo que lo pongas detrás de un proxy y un cortafuegos.
- `.env` está excluido del control de versiones; `.env.example` documenta las
  variables de entorno que se suelen definir.
- El repositorio entero se distribuye bajo la **Licencia MIT**. Ver
  [`LICENSE`](./LICENSE) y [`NOTICE`](./NOTICE).
- Las copias se descargan cifradas con una contraseña que eliges; si la pierdes,
  la copia no se puede abrir. El directorio de datos se crea `0700` y la base
  `0600`.
- Los paquetes de escritorio de Windows y macOS se compilan sin firmar en CI;
  Linux es la ruta de escritorio probada.
- [`SECURITY.md`](./SECURITY.md) describe el canal privado para reportar
  vulnerabilidades.
- [`PRIVACY.md`](./PRIVACY.md) es la política de privacidad (en español:
  [`docs/es/POLITICA-DE-PRIVACIDAD.md`](./docs/es/POLITICA-DE-PRIVACIDAD.md)).
