# 13 · AI providers

> **Audience:** both. How to pick and configure the model OpenExpert uses.

OpenExpert does not require any AI account. You choose the provider; the
selection lives in `openexpert.json` or the `OPENEXPERT_*` environment
variables (env wins).

| Provider            | Key                    | Cost      | Data leaves your machine |
| ------------------- | ---------------------- | --------- | ------------------------ |
| `ollama`            | none                   | free      | no                       |
| `google`            | `GOOGLE_API_KEY`       | free tier | yes (to Google)          |
| `openai-compatible` | `OPENEXPERT_MODEL_KEY` | depends   | yes                      |

## Ollama (recommended, fully local)

1. Install Ollama: <https://ollama.com> (`curl -fsSL https://ollama.com/install.sh | sh`).
2. Pull a model: `ollama pull llama3.1`.
3. Configure:

```json
{ "modelProvider": "ollama", "modelId": "llama3.1" }
```

Ollama listens on `http://localhost:11434`; OpenExpert uses its
OpenAI-compatible endpoint (`/v1`). No data leaves your machine.

## Google Gemini (free API key)

1. Go to **Google AI Studio** (<https://aistudio.google.com/apikey>) and create
   an API key. The free tier is enough for personal use.
2. Configure:

```sh
export OPENEXPERT_MODEL_PROVIDER=google
export OPENEXPERT_MODEL_ID=gemini-2.5-flash
export GOOGLE_API_KEY=your-key
```

With Google, the assistant shows its reasoning (thinking) in the interface.

## Any OpenAI-compatible endpoint (BYOK)

```sh
export OPENEXPERT_MODEL_PROVIDER=openai-compatible
export OPENEXPERT_BASE_URL=https://your-endpoint/v1
export OPENEXPERT_MODEL_KEY=your-key
export OPENEXPERT_MODEL_ID=gpt-4o-mini
```

## Using the CLI

```sh
npx @openexpert/opencore        # interactive wizard
npx @openexpert/opencore models # list models for the current provider
npx @openexpert/opencore doctor # check the configuration
```

The wizard stores secrets in `~/.openexpert/secrets.json` (mode `0600`), never
in the repository.

## References

- [Quickstart](./00-quickstart.md) — first run.
- [AI](./05-ai.md) — assistant tools and limits.
