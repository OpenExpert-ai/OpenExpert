# 11 · Engine and CLI

> **Audience:** both. The package `@openexpert/openexpert`: what the app reuses, and the CLI you install.

---

## 1. Object

`@openexpert/openexpert` (MIT, in `packages/openexpert/`) is the package of the
local edition: the engine the application reuses —model-provider catalogue,
configuration loading, the storage and token interfaces, the tool catalog— plus
the **`openexpert` CLI** that installs, configures and runs it. There is no
second product name: the package, the CLI and the application are all OpenExpert,
and the **version you see in a release is this package's**, the only one that is
published.

## 2. What it contains

| Module                   | Purpose                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `src/model-provider.ts`  | `selectModel` / `missingKeyHint`; adapters `google`, `anthropic`, `openai-compatible` |
| `src/providers.ts`       | The provider catalogue (adapter, endpoint, key variable, models)                      |
| `src/provider-models.ts` | Asks a provider which models it serves                                                |
| `src/config.ts`          | Loads `openexpert.json` + `OPENEXPERT_*`                                              |
| `src/storage.ts`         | `Storage` interface (file-backed)                                                     |
| `src/secrets.ts`         | `TokenStore` interface and credentials path                                           |
| `src/tools.ts`           | Tool catalog                                                                          |
| `src/index.ts`           | Barrel: re-exports config, model-provider, provider-models, storage, secrets, tools   |
| `schema/`                | `openexpert.schema.json` (the `./schema` export) for `openexpert.json`                |
| `src/cli/`               | The `openexpert` CLI                                                                  |

## 3. CLI

```sh
npx @openexpert/openexpert          # interactive setup, then starts
npx @openexpert/openexpert serve    # start
npx @openexpert/openexpert doctor   # check configuration
npx @openexpert/openexpert fix      # auto-configure what is missing
npx @openexpert/openexpert models   # list models for the current provider
npx @openexpert/openexpert update   # refresh the downloaded server
npx @openexpert/openexpert desktop  # start the server and open the native window
npx @openexpert/openexpert version  # print the version
npx @openexpert/openexpert help     # usage
```

`serve` runs from a source checkout (`npm run dev`) or from a downloaded,
checksum-verified server build, which it fetches from the release tagged
`v<version>`.

## 4. Configuration

| Variable                                                                                | Purpose                                                                     |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `OPENEXPERT_MODEL_PROVIDER`                                                             | `ollama` \| `google` \| `anthropic` \| `openai-compatible` \| `opencode-go` |
| `OPENEXPERT_MODEL_ID`                                                                   | Model identifier                                                            |
| `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY` / `OPENCODE_GO_API_KEY` / `OPENEXPERT_MODEL_KEY` | One key per provider                                                        |
| `OPENEXPERT_BASE_URL`                                                                   | Endpoint of the generic `openai-compatible` provider                        |
| `OLLAMA_BASE_URL`                                                                       | Ollama endpoint                                                             |
| `OPENEXPERT_DATA_DIR`                                                                   | Data directory (default `~/.openexpert/`)                                   |
| `OPENEXPERT_HOST` / `PORT`                                                              | Interface and port of the local server (`127.0.0.1:3000`)                   |
| `OPENEXPERT_ALLOWED_ORIGINS`                                                            | Extra names the server answers to (LAN or reverse proxy), comma separated   |
| `OPENEXPERT_LOG_LEVEL`                                                                  | `debug` \| `info` \| `warn` \| `error`                                      |

Neither `openexpert.json` nor `~/.openexpert/` is committed.

## 5. References

- [Quickstart](./00-quickstart.md).
- [AI providers](./13-ai-providers.md).
- [Licensing model](./12-licensing.md).
