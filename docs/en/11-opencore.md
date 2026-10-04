# 11 · OpenCore

> **Audience:** both. The shared MIT engine and CLI.

---

## 1. Object

**OpenCore** is the open-source engine and CLI of OpenExpert, distributed under
the MIT license (`packages/opencore/`). It provides the model-provider selector,
configuration loading, the storage/token interfaces, the tool catalog and the
`opencore` CLI.

## 2. What it contains

| Module                  | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `src/model-provider.ts` | `selectModel` / `missingKeyHint` (google, ollama, openai-compatible) |
| `src/config.ts`         | Loads `openexpert.json` + `OPENEXPERT_*`                             |
| `src/storage.ts`        | `Storage` interface (file-backed)                                    |
| `src/secrets.ts`        | `TokenStore` interface and credentials path                          |
| `src/tools.ts`          | Tool catalog                                                         |
| `src/cli/`              | The `opencore` CLI                                                   |

## 3. CLI

```sh
npx @openexpert/opencore          # interactive setup, then starts
npx @openexpert/opencore serve    # start
npx @openexpert/opencore doctor   # check configuration
npx @openexpert/opencore fix      # auto-configure what is missing
npx @openexpert/opencore models   # list models for the current provider
npx @openexpert/opencore update   # refresh the downloaded server
```

`serve` runs from a source checkout (`npm run dev`) or from a downloaded,
checksum-verified server build.

## 4. Configuration

| Variable                                       | Purpose                                     |
| ---------------------------------------------- | ------------------------------------------- |
| `OPENEXPERT_MODEL_PROVIDER`                    | `google` \| `ollama` \| `openai-compatible` |
| `OPENEXPERT_MODEL_ID`                          | Model identifier                            |
| `GOOGLE_API_KEY`                               | Gemini key                                  |
| `OPENEXPERT_MODEL_KEY` / `OPENEXPERT_BASE_URL` | OpenAI-compatible endpoint                  |
| `OLLAMA_BASE_URL`                              | Ollama endpoint                             |
| `OPENEXPERT_DATA_DIR`                          | Data directory (default `~/.openexpert/`)   |

Neither `openexpert.json` nor `~/.openexpert/` is committed.

## 5. References

- [Quickstart](./00-quickstart.md).
- [AI providers](./13-ai-providers.md).
- [Licensing model](./12-licensing.md).
