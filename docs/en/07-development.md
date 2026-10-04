# 07 · Development

> **Audience:** engineering team.

---

## 1. Requirements

| Tool    | Version     |
| ------- | ----------- |
| Node.js | 20 or later |
| npm     | 10 or later |

## 2. Bootstrapping

```sh
npm ci
cp openexpert.json.example openexpert.json   # optional; defaults work
npm run dev                                 # http://localhost:3000
```

In a fresh checkout, `npm ci` also builds `packages/opencore` (its `prepare`
script), so the CLI is ready.

## 3. Environment variables

Documented in `.env.example`. The essentials:

| Variable                                            | Function                                           |
| --------------------------------------------------- | -------------------------------------------------- |
| `OPENEXPERT_MODEL_PROVIDER`                         | `ollama` \| `google` \| `openai-compatible`        |
| `OPENEXPERT_MODEL_ID`                               | Model identifier                                   |
| `GOOGLE_API_KEY`                                    | Gemini key (`google`)                              |
| `OPENEXPERT_BASE_URL` / `OPENEXPERT_MODEL_KEY`      | `openai-compatible` endpoint                       |
| `OLLAMA_BASE_URL`                                   | Ollama endpoint                                    |
| `OPENEXPERT_DATA_DIR`                               | Data directory (default `~/.openexpert/`)          |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`         | Drive OAuth (optional)                             |
| `GOOGLE_REDIRECT_URI` / `GOOGLE_OAUTH_STATE_SECRET` | Drive OAuth (optional)                             |
| `PUBLIC_APP_URL`                                    | Public origin used to build the Drive redirect URI |

`.env` is git-ignored. The CLI wizard stores secrets in
`~/.openexpert/secrets.json`, which the server loads into the environment at
startup (existing env vars win), so `npm run dev` and `opencore serve` behave
the same.

## 4. Scripts

| Script                            | Function                               |
| --------------------------------- | -------------------------------------- |
| `npm run dev`                     | Dev server on port **3000** (fixed)    |
| `npm run build`                   | Production build (Nitro `node-server`) |
| `npm run preview`                 | Serve the build                        |
| `npm run lint` / `lint:fix`       | ESLint                                 |
| `npm run format` / `format:check` | Prettier                               |
| `npm run typecheck`               | TypeScript without emit                |
| `npm run test:run`                | Tests (app + package)                  |
| `npm run opencore:doctor`         | CLI diagnostics                        |
| `npm run opencore:serve`          | Boot the app through the CLI           |
| `npm run license:check`           | Verify SPDX headers                    |

### Port 3000

`vite.config.ts` pins `port: 3000` and `strictPort: true`; the Drive OAuth
redirect URI depends on it. The Nitro preset is always `node-server`.

## 5. Database

The schema is `drizzle/schema.ts` (Drizzle) plus `drizzle/init.sql` (the DDL).
`src/lib/db.server.ts` opens the SQLite file and applies the DDL at startup, then
seeds example data. **Keep the two schema files in sync.** There is no migration
runner: to change the schema, edit both and (if needed) handle existing files.

After any write, call `await persist()` so the file on disk is updated.

## 6. Code conventions

- File-based routes in `src/routes/`; `routeTree.gen.ts` is generated.
- `.server.ts` modules are server-only.
- Validation at the edge with Zod; user-facing messages in Spanish.
- Format with Prettier; no implicit `any`.

## 7. Pre-flight verification

```sh
npm run typecheck
npm run lint
npm run test:run
npm run build
```

## 8. References

- [Architecture](./02-architecture.md) — code map.
- [Data model](./03-data-model.md) — tables.
- [Deployment](./08-deployment.md) — running it.
