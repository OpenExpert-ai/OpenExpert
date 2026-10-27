# 00 · Quickstart (5 minutes)

> **Audience:** everyone. The fastest path from zero to chatting.

OpenExpert runs entirely on your machine: a single SQLite file, no accounts and
no database server.

---

## Option A — Docker (no Node required)

```sh
docker run --rm -p 127.0.0.1:3000:3000 -v openexpert-data:/data \
  ghcr.io/openexpert-ai/openexpert:latest
```

Open <http://localhost:3000>. Data persists in the `openexpert-data` volume.
The app has no login, so the `127.0.0.1:` prefix is deliberate: it keeps the
port off your network.
You still need a model; the easiest is Ollama.

### With Ollama included

```sh
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

## Option B — With Node (the CLI)

```sh
npx @openexpert/openexpert
```

The wizard detects Ollama, lets you choose a provider, writes
`openexpert.json`, and starts the app. Other commands:

```sh
npx @openexpert/openexpert serve     # start
npx @openexpert/openexpert doctor    # check configuration
npx @openexpert/openexpert fix       # auto-configure what is missing
npx @openexpert/openexpert models    # list models for the current provider
npx @openexpert/openexpert update    # refresh the downloaded server
npx @openexpert/openexpert desktop   # start the server and open the native window
```

### Scaffold a project

```sh
npm create openexpert my-app
cd my-app
docker compose up -d
docker compose exec ollama ollama pull llama3.1
```

## Option C — From source

```sh
git clone https://github.com/OpenExpert-ai/OpenExpert.git
cd OpenExpert
npm ci
npm run dev          # http://localhost:3000
```

---

## Choosing a model

See [AI providers](./13-ai-providers.md). In short:

| Provider            | Needs                                | Notes                           |
| ------------------- | ------------------------------------ | ------------------------------- |
| `ollama`            | [Ollama](https://ollama.com) running | No keys, data stays local       |
| `google`            | `GOOGLE_API_KEY`                     | Gemini, free key from AI Studio |
| `openai-compatible` | base URL + key                       | Any OpenAI-compatible endpoint  |
| `anthropic`         | `ANTHROPIC_API_KEY`                  | Claude                          |
| `opencode-go`       | `OPENCODE_GO_API_KEY`                | OpenCode Go, subscription       |

The wizard stores secrets in `~/.openexpert/secrets.json` (mode `0600`), never
in the repository.

## Connect your data

The business tables start empty. Open **Settings → Data**:

- **Sample data** loads demo deals and invoices; remove them later without
  touching real rows.
- **CSV import** covers deals, invoices, campaigns and accounts. Download the
  template, fill it and import; Spanish and English header names are accepted,
  and the separator is read from the file itself (`,`, `;` as Spanish Excel
  writes it, tab or `|`), never from the extension.
- **Connectors** are optional: Pipedrive (deals) and Holded (invoices) are
  pull-only and need your own API token/key. Paste it and press **Sync**.

On Linux, `./install.sh` runs the provider wizard at the end; add
`--with-ollama` to install Ollama and pull llama3.1 first, and it also offers
the two connectors without writing the key to a log.

## Where things live

| Thing         | Location                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| Configuration | `openexpert.json` (in the working directory)                                                          |
| Database      | `OPENEXPERT_DATA_DIR/openexpert.db` (default `~/.openexpert/`)                                        |
| Secrets       | `~/.openexpert/secrets.json` (`0600`)                                                                 |
| Source tokens | `~/.openexpert/` (`credentials.json`, `drive-grants.json`, `local-roots.json`, `notion.json`; `0600`) |

## Troubleshooting

- **Chat says the model key is missing.** Run `openexpert fix` or `openexpert init`.
- **Ollama not detected.** Install it and pull a model: `ollama pull llama3.1`.
- **Port 3000 busy.** Free it; the dev server is pinned to 3000.
- **Docker image not found, or the pull is denied.** The image is public; check
  your network or Docker login state. If you prefer, build it locally:
  `docker build -f docker/Dockerfile -t openexpert:local .`

## Next steps

- [Architecture](./02-architecture.md) — how it is built.
- [AI providers](./13-ai-providers.md) — Ollama, Gemini, BYOK.
- [Licensing model](./12-licensing.md) — what is open and what is monetised.
