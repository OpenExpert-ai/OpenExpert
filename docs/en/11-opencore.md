# 11 · OpenCore (downloadable local edition)

> **Audience:** both. What is free, what is paid and how to use it on
> your own team.

---

## 1. Object

**OpenCore** is the local, downloadable edition of OpenExpert,
distributed under the MIT license (`packages/opencore/`). It runs on
your own machine without mandatory external accounts, with local data
custody and freedom to choose the model provider.

**OpenExpert Cloud** is the multi-user edition (Supabase + Vercel):
roles per Expert, invitations, centralised audit and managed backups.
Both editions share the tool catalogue, per-Expert isolation, the
pre-filter and human approval.

## 2. Editions compared

| Aspect         | OpenExpert Cloud                     | OpenCore local                                                 |
| -------------- | ------------------------------------ | -------------------------------------------------------------- |
| User           | Multi-user with roles                | Single owner (`local-owner`, `ADMIN`), no login                |
| Authentication | Google OAuth + trigger + profile     | None                                                           |
| Persistence    | PostgreSQL (Supabase)                | JSON files in `OPENEXPERT_DATA_DIR` (default `~/.openexpert/`) |
| Drive tokens   | `google_tokens` table (service only) | `credentials.json` (mode `0600`)                               |
| Model          | Gemini via `GOOGLE_API_KEY`          | Selector `google \| ollama \| openai-compatible \| openexpert` |
| Server         | Nitro preset `vercel`                | Nitro preset `node-server` when `OPENEXPERT_MODE=local`        |
| Guarantees     | —                                    | Per-Expert isolation, pre-filter, human approval               |

## 3. Quick start (three steps)

```sh
cp openexpert.json.example openexpert.json
OPENEXPERT_MODE=local npm run dev   # http://localhost:3000
npm run opencore:doctor
```

- Without `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` the chat works
  normally; Drive will report "pending connection".
- With `OPENEXPERT_MODEL_PROVIDER=ollama` no external key is required.
- The published CLI runs the same setup out of the box:

  ```sh
  npx @openexpert/opencore doctor
  npx @openexpert/opencore serve
  ```

- A Docker image is also published:

  ```sh
  docker run --rm -p 3000:3000 \
    -v openexpert-data:/data \
    ghcr.io/openexpert/openexpert:latest
  ```

## 4. Model configuration

| Variable                    | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `OPENEXPERT_MODE`           | `local` (own machine) or `cloud` (multi-user)               |
| `OPENEXPERT_MODEL_PROVIDER` | `google` \| `ollama` \| `openai-compatible` \| `openexpert` |
| `OPENEXPERT_MODEL_ID`       | Model identifier                                            |
| `OPENEXPERT_MODEL_KEY`      | Key for the `openai-compatible` provider                    |
| `OPENEXPERT_BASE_URL`       | Endpoint for the `openai-compatible` provider               |
| `OPENEXPERT_GATEWAY_URL`    | Endpoint of the OpenExpert gateway (`openexpert` provider)  |
| `OPENEXPERT_API_KEY`        | Account token for the OpenExpert gateway                    |
| `OLLAMA_BASE_URL`           | Ollama endpoint (default local)                             |
| `GOOGLE_API_KEY`            | Google AI Studio key (`google` provider)                    |
| `OPENEXPERT_DATA_DIR`       | Local data directory (default `~/.openexpert/`)             |

Neither `openexpert.json` nor `~/.openexpert/` is committed.

## 5. Internal architecture

- `packages/opencore/` — MIT package: mode, config, model-provider,
  gateway, storage and secrets interfaces, tool catalogue, CLI.
- `src/lib/opencore/mode.ts` — re-export of the package's mode helpers.
- `src/lib/opencore/model-provider.server.ts` — selects the model and
  builds the AI SDK `LanguageModel`, including the `openexpert`
  gateway.
- `src/lib/opencore/file-storage.server.ts` — local persistence in
  JSON.
- `src/lib/opencore/auth.server.ts` — single-owner local auth context.
- `src/lib/opencore/local-secrets.server.ts` — local credential
  custody.
- `openexpert.json.example` — public template of the local config.
- `packages/opencore/schema/openexpert.schema.json` — JSON Schema used
  by editors and the package to validate `openexpert.json`.

## 6. Public and private content

Public under MIT: `packages/opencore/`, the tool catalogue, model
selector, local mode, SQL migrations, `openexpert.json.example`,
`SECURITY.md` and this documentation.

Never public: `.env`, `openexpert.json`, `~/.openexpert/` (including
`credentials.json`), service keys, OAuth secret, `auth.users`,
production project references and billing information.

## References

- [Security & access](./04-security.md) — roles and secrets.
- [AI](./05-ai.md) — providers and tools.
- [Deployment §7](./08-deployment.md#7-local-mode-opencore-no-deployment) — local mode without deployment.
