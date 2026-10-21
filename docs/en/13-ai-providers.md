# 13 · AI providers

> **Audience:** both. How to pick and configure the model OpenExpert uses.

OpenExpert does not require any AI account. You choose the provider; the
selection lives in `openexpert.json` or the `OPENEXPERT_*` environment
variables (env wins).

| Provider            | Key                    | Endpoint                      | Cost         | Data leaves your machine |
| ------------------- | ---------------------- | ----------------------------- | ------------ | ------------------------ |
| `ollama`            | none                   | yours (`OLLAMA_BASE_URL`)     | free         | no                       |
| `google`            | `GOOGLE_API_KEY`       | the provider's                | free tier    | yes (to Google)          |
| `anthropic`         | `ANTHROPIC_API_KEY`    | the provider's                | paid         | yes (to Anthropic)       |
| `openai-compatible` | `OPENEXPERT_MODEL_KEY` | yours (`OPENEXPERT_BASE_URL`) | depends      | yes                      |
| `opencode-go`       | `OPENCODE_GO_API_KEY`  | the provider's                | subscription | yes                      |

**One key per provider.** Every record in the catalogue names the variable that
holds its key, and no two records share one: saving a provider's key never
touches what another provider stored. The settings panel reads that variable off
the catalogue, so it asks for, stores and labels each key in its own place.
Nothing falls back to another provider's key either — a missing key is reported
by naming the variable that is missing, not by trying somebody else's.

## 1. Ollama (recommended, fully local)

1. Install Ollama: <https://ollama.com> (`curl -fsSL https://ollama.com/install.sh | sh`).
2. Pull a model: `ollama pull llama3.1`.
3. Configure:

```json
{ "modelProvider": "ollama", "modelId": "llama3.1" }
```

Ollama listens on `http://localhost:11434`; OpenExpert uses its
OpenAI-compatible endpoint (`/v1`). `OLLAMA_BASE_URL` accepts either the native
root (`http://localhost:11434`) or the `/v1` URL, and normalises it for both the
chat model and model listing. No data leaves your machine.

## 2. Google Gemini (free API key)

1. Go to **Google AI Studio** (<https://aistudio.google.com/apikey>) and create
   an API key. The free tier is enough for personal use.
2. Configure:

```sh
export OPENEXPERT_MODEL_PROVIDER=google
export OPENEXPERT_MODEL_ID=gemini-2.5-flash
export GOOGLE_API_KEY=your-key
```

With Google, the assistant shows its reasoning (thinking) in the interface.

## 3. Anthropic (Claude)

1. Create a key in the **Anthropic console**
   (<https://console.anthropic.com/settings/keys>).
2. Configure:

```sh
export OPENEXPERT_MODEL_PROVIDER=anthropic
export OPENEXPERT_MODEL_ID=claude-sonnet-4-5
export ANTHROPIC_API_KEY=your-key
```

Its endpoint is the one in the catalogue (`https://api.anthropic.com/v1`), so
there is nothing else to point anywhere. **List** in the settings panel asks the
provider which models that key can use and offers what it answers, next to the
ids the catalogue already knows.

## 3.1 Probing without saving

**Probar conexión** and **List** ask about **what is written in the form**, not
about what is stored: you pick another provider, type its key, and the question
goes to that provider with that key, even if you have not pressed save. The
notice says which of the two things was asked.

If you leave the key blank, the question uses the stored one (a blank field
means "do not change it", not "there is none"). Probing **saves nothing**: not
the key, not the endpoint, not the provider.

```sh
# The saved configuration is what gets asked when nothing is written
openexpert models
```

## 4. Any OpenAI-compatible endpoint (BYOK)

```sh
export OPENEXPERT_MODEL_PROVIDER=openai-compatible
export OPENEXPERT_BASE_URL=https://your-endpoint/v1
export OPENEXPERT_MODEL_KEY=your-key
export OPENEXPERT_MODEL_ID=gpt-4o-mini
```

This is the only provider whose endpoint the owner provides, so it is the only
one that asks for it.

## 5. OpenCode Go

```sh
export OPENEXPERT_MODEL_PROVIDER=opencode-go
export OPENEXPERT_MODEL_ID=deepseek-v4.1-flash
export OPENCODE_GO_API_KEY=your-key
```

Its service routes per conversation and asks for the session header its record
declares in the catalogue (`x-opencode-session`), which travels only with the
conversation id and only for this provider.

## 6. Using the CLI

```sh
npx @openexpert/openexpert        # interactive wizard
npx @openexpert/openexpert models # list models for the current provider
npx @openexpert/openexpert doctor # check the configuration
```

The wizard and the panel store secrets in `~/.openexpert/secrets.json` (mode
`0600`), never in the repository. `doctor` checks the key of the provider you
have selected and names the variable that is missing when one is.

## References

- [Quickstart](./00-quickstart.md) — first run.
- [AI](./05-ai.md) — assistant tools and limits.
