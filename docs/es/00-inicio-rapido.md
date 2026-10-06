# 00 · Inicio rápido (5 minutos)

> **Audiencia:** todos. El camino más corto de cero a chatear.

OpenExpert funciona enteramente en tu equipo: un único fichero SQLite, sin
cuentas y sin servidor de base de datos.

---

## Opción A — Docker (sin Node)

```sh
docker run --rm -p 3000:3000 -v openexpert-data:/data \
  ghcr.io/openexpert-ai/openexpert:local
```

Abre <http://localhost:3000>. Los datos persisten en el volumen
`openexpert-data`. Aún necesitas un modelo; lo más fácil es Ollama.

### Con Ollama incluido

```sh
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

## Opción B — Con Node (el CLI de OpenCore)

```sh
npx @openexpert/opencore
```

El asistente detecta Ollama, te deja elegir proveedor, escribe
`openexpert.json` y arranca la aplicación. Otros comandos:

```sh
npx @openexpert/opencore serve     # arrancar
npx @openexpert/opencore doctor    # revisar la configuración
npx @openexpert/opencore fix       # auto-configurar lo que falte
npx @openexpert/opencore models    # listar modelos del proveedor actual
npx @openexpert/opencore update    # actualizar el servidor descargado
```

### Crear un proyecto

```sh
npm create openexpert mi-app
cd mi-app
docker compose up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

## Opción C — Desde el código

```sh
git clone https://github.com/OpenExpert-ai/OpenExpert.git
cd OpenExpert
npm ci
npm run dev          # http://localhost:3000
```

---

## Elegir un modelo

Ver [Proveedores de IA](./13-proveedores-ia.md). En resumen:

| Proveedor           | Necesita                               | Notas                                |
| ------------------- | -------------------------------------- | ------------------------------------ |
| `ollama`            | [Ollama](https://ollama.com) en marcha | Sin claves, datos en local           |
| `google`            | `GOOGLE_API_KEY`                       | Gemini, clave gratuita de AI Studio  |
| `openai-compatible` | base URL + clave                       | Cualquier endpoint OpenAI-compatible |

El asistente guarda los secretos en `~/.openexpert/secrets.json` (permisos
`0600`), nunca en el repositorio.

## Dónde vive cada cosa

| Elemento          | Ubicación                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Configuración     | `openexpert.json` (en el directorio de trabajo)                                                       |
| Base de datos     | `OPENEXPERT_DATA_DIR/openexpert.db` (por defecto `~/.openexpert/`)                                    |
| Secretos          | `~/.openexpert/secrets.json` (`0600`)                                                                 |
| Tokens de fuentes | `~/.openexpert/` (`credentials.json`, `drive-grants.json`, `local-roots.json`, `notion.json`; `0600`) |

## Diagnóstico

- **El chat dice que falta la clave del modelo.** Ejecuta `opencore fix` u
  `opencore init`.
- **No detecta Ollama.** Instálalo y descarga un modelo: `ollama pull llama3.1`.
- **El puerto 3000 está ocupado.** Libéralo; el servidor está fijado al 3000.
- **No encuentra la imagen Docker.** Constrúyela en local:
  `docker build -f docker/Dockerfile -t openexpert:local .`

## Siguientes pasos

- [Arquitectura](./02-arquitectura.md) — cómo está construido.
- [Proveedores de IA](./13-proveedores-ia.md) — Ollama, Gemini, BYOK.
- [Modelo de licencia](./12-licencia.md) — qué es abierto y qué se monetiza.
