# 00 · Inicio rápido (5 minutos)

> **Audiencia:** todos. El camino más corto de cero a chatear.

OpenExpert se distribuye en dos ediciones construidas desde el mismo
código:

- **OpenCore (local):** funciona en tu equipo, un solo propietario, sin
  nube.
- **Cloud:** multiusuario sobre Supabase + Vercel.

Elige una.

---

## Opción A — Local con Docker (sin Node)

```sh
docker run --rm -p 3000:3000 -v openexpert-data:/data \
  ghcr.io/openexpert/openexpert:local
```

Abre <http://localhost:3000>. Los datos persisten en el volumen
`openexpert-data`. Aún necesitas un modelo: ejecuta Ollama en el equipo
o indica un proveedor (ver "Elegir un modelo").

### Con Ollama incluido

```sh
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

## Opción B — Local con Node (el CLI de OpenCore)

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
git clone https://github.com/OpenExpert/OpenExpert.git
cd OpenExpert
npm ci
cp openexpert.json.example openexpert.json
npm run dev:local          # http://localhost:3000
```

Para la edición cloud:

```sh
cp .env.example .env       # completar las variables
npm run dev
```

---

## Elegir un modelo

Configura `OPENEXPERT_MODEL_PROVIDER` (o elígelo en el asistente):

| Proveedor           | Necesita                               | Notas                                |
| ------------------- | -------------------------------------- | ------------------------------------ |
| `ollama`            | [Ollama](https://ollama.com) en marcha | Sin claves, datos en local           |
| `openexpert`        | Un token de la pasarela                | Pasarela alojada de OpenExpert       |
| `google`            | `GOOGLE_API_KEY`                       | Gemini                               |
| `openai-compatible` | base URL + clave                       | Cualquier endpoint OpenAI-compatible |

El asistente guarda los secretos en `~/.openexpert/secrets.json` (permisos
`0600`), nunca en el repositorio.

## Dónde vive cada cosa

| Elemento        | Ubicación                                            |
| --------------- | ---------------------------------------------------- |
| Configuración   | `openexpert.json` (en el directorio de trabajo)      |
| Datos locales   | `OPENEXPERT_DATA_DIR` (por defecto `~/.openexpert/`) |
| Secretos        | `~/.openexpert/secrets.json` (`0600`)                |
| Tokens de Drive | `~/.openexpert/credentials.json` (`0600`)            |

## Diagnóstico

- **El chat dice que falta la clave del modelo.** Ejecuta `opencore fix`
  u `opencore init`.
- **No detecta Ollama.** Instálalo y descarga un modelo:
  `ollama pull llama3.1`.
- **El puerto 3000 está ocupado.** Libéralo; el servidor está fijado al 3000.
- **No encuentra la imagen Docker.** Constrúyela en local:
  `docker build -f docker/Dockerfile -t openexpert:local .`

## Siguientes pasos

- [OpenCore](./11-opencore.md) — la edición local en detalle.
- [Desarrollo](./07-desarrollo.md) — entorno y migraciones.
- [Modelo de licencia](./12-licencia.md) — qué es abierto y qué alojado.
