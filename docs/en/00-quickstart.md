# 00 · Quickstart (5 minutes)

> **Audience:** everyone. The fastest path from zero to chatting.

OpenExpert ships in two editions built from the same source:

- **OpenCore (local):** runs on your machine, single owner, no cloud.
- **Cloud:** multi-user on Supabase + Vercel.

Pick one below.

---

## Option A — Local with Docker (no Node required)

```sh
docker run --rm -p 3000:3000 -v openexpert-data:/data \
  ghcr.io/openexpert/openexpert:local
```

Open <http://localhost:3000>. Data persists in the `openexpert-data`
volume. You still need a model: either run Ollama on the host, or pass a
provider (see "Choosing a model").

### With Ollama included

```sh
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

## Option B — Local with Node (the OpenCore CLI)

```sh
npx @openexpert/opencore
```

The wizard detects Ollama, lets you choose a provider, writes
`openexpert.json`, and starts the app. Other commands:

```sh
npx @openexpert/opencore serve     # start
npx @openexpert/opencore doctor    # check configuration
npx @openexpert/opencore fix       # auto-configure what is missing
npx @openexpert/opencore models    # list models for the current provider
npx @openexpert/opencore update    # refresh the downloaded server
```

### Scaffold a project

```sh
npm create openexpert my-app
cd my-app
docker compose up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

## Option C — From source

```sh
git clone https://github.com/OpenExpert/OpenExpert.git
cd OpenExpert
npm ci
cp openexpert.json.example openexpert.json
npm run dev:local          # http://localhost:3000
```

For the cloud edition:

```sh
cp .env.example .env       # fill in the variables
npm run dev
```

---

## Choosing a model

Set `OPENEXPERT_MODEL_PROVIDER` (or pick it in the wizard):

| Provider            | Needs                                | Notes                          |
| ------------------- | ------------------------------------ | ------------------------------ |
| `ollama`            | [Ollama](https://ollama.com) running | No keys, data stays local      |
| `openexpert`        | A gateway token                      | Hosted OpenExpert gateway      |
| `google`            | `GOOGLE_API_KEY`                     | Gemini                         |
| `openai-compatible` | base URL + key                       | Any OpenAI-compatible endpoint |

The wizard stores secrets in `~/.openexpert/secrets.json` (mode `0600`),
never in the repository.

## Where things live

| Thing         | Location                                         |
| ------------- | ------------------------------------------------ |
| Configuration | `openexpert.json` (in the working directory)     |
| Local data    | `OPENEXPERT_DATA_DIR` (default `~/.openexpert/`) |
| Secrets       | `~/.openexpert/secrets.json` (`0600`)            |
| Drive tokens  | `~/.openexpert/credentials.json` (`0600`)        |

## Troubleshooting

- **Chat says the model key is missing.** Run `opencore fix` or
  `opencore init`.
- **Ollama not detected.** Install it and pull a model:
  `ollama pull llama3.1`.
- **Port 3000 busy.** Free it; the dev server is pinned to 3000.
- **Docker image not found.** Build locally:
  `docker build -f docker/Dockerfile -t openexpert:local .`

## Next steps

- [OpenCore](./11-opencore.md) — the local edition in depth.
- [Development](./07-development.md) — environment and migrations.
- [Licensing model](./12-licensing.md) — what is open and what is hosted.
