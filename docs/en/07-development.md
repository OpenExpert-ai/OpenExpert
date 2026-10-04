# 07 · Development

> **Audience:** engineering team. This document describes how to set up
> the development environment.

---

## 1. Requirements

| Tool      | Minimum version | Notes                    |
| --------- | --------------- | ------------------------ |
| Node.js   | 20              | Current LTS recommended  |
| Cloud SDK | 10              | Official package manager |

The Supabase CLI is not required for everyday development.

## 2. Bootstrapping

```sh
npm ci                              # installs the tree pinned in package-lock.json
cp .env.example .env                # documented template
# Fill .env with the corresponding credentials (see §3)
npm run dev                         # http://localhost:3000
```

Use `npm ci` over `npm install`, as it respects the exact lockfile.

Local mode (OpenCore, no Supabase):

```sh
cp openexpert.json.example openexpert.json
OPENEXPERT_MODE=local npm run dev   # http://localhost:3000
npm run opencore:doctor             # configuration check
```

In local mode no Supabase credentials are required. See
[11-opencore](./11-opencore.md).

## 3. Environment variables

All variables are documented with comments in `.env.example`.

| Variable                        | Function                                                        |
| ------------------------------- | --------------------------------------------------------------- |
| `SUPABASE_URL`                  | Project URL. Required in cloud mode                             |
| `SUPABASE_PUBLISHABLE_KEY`      | Browser and server key. Required in cloud mode                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Privileged writes. Server only                                  |
| `VITE_SUPABASE_URL`             | Same URL, for the browser bundle                                |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same public key, for the browser bundle                         |
| `VITE_SUPABASE_PROJECT_ID`      | Project reference, for the bundle                               |
| `GOOGLE_API_KEY`                | Gemini key. Without it, the chat returns error 500              |
| `GOOGLE_CLIENT_ID`              | Google sign-in and Drive OAuth                                  |
| `GOOGLE_CLIENT_SECRET`          | Google sign-in and Drive OAuth                                  |
| `GOOGLE_REDIRECT_URI`           | Fixed Drive return URI (optional)                               |
| `GOOGLE_OAUTH_STATE_SECRET`     | Secret to sign the `state` parameter (optional)                 |
| `PUBLIC_APP_URL`                | Public origin in production (optional)                          |
| `DATABASE_URL`                  | Used only by `npm run db:migrate`                               |
| `OPENEXPERT_MODE`               | `cloud` (default) or `local`                                    |
| `OPENEXPERT_MODEL_PROVIDER`     | `google` \| `ollama` \| `openai-compatible` \| `openexpert`     |
| `OPENEXPERT_MODEL_ID`           | Model identifier as known by the provider                       |
| `OPENEXPERT_GATEWAY_URL`        | Base URL of the OpenExpert gateway (with `openexpert` provider) |
| `OPENEXPERT_API_KEY`            | Account token of the OpenExpert gateway                         |
| `OPENEXPERT_DATA_DIR`           | Local data directory. Default `~/.openexpert/`                  |

> In development, the Vite plugin exposes the full content of `.env` in
> `process.env` on the server. **In production this does not apply**:
> variables must be defined in the hosting platform. See
> [08-deployment](./08-deployment.md).

`.env` is git-ignored; `.env.example` documents the variables without
values.

## 4. Scripts

| Script                    | Function                                           |
| ------------------------- | -------------------------------------------------- |
| `npm run dev`             | Dev server on port **3000** (fixed)                |
| `npm run dev:local`       | Dev server in local mode (`OPENEXPERT_MODE=local`) |
| `npm run opencore:doctor` | Local mode diagnostics                             |
| `npm run opencore:serve`  | Boot the local edition through the CLI             |
| `npm run build`           | Production build                                   |
| `npm run build:dev`       | Development build, for debugging the bundle        |
| `npm run preview`         | Serve the build locally                            |
| `npm run lint`            | ESLint on the repo                                 |
| `npm run lint:fix`        | ESLint with --fix                                  |
| `npm run format`          | Prettier in write mode                             |
| `npm run format:check`    | Prettier check (used in CI)                        |
| `npm run typecheck`       | TypeScript without emit                            |
| `npm run test`            | Run all tests (workspaces)                         |
| `npm run test:run`        | Run tests once                                     |
| `npm run db:migrate`      | Apply migrations (requires `DATABASE_URL`)         |
| `npm run db:studio`       | Drizzle Studio for database exploration            |
| `npm run changeset`       | Create a changeset entry                           |
| `npm run release`         | Build and publish a release                        |
| `npm run license:check`   | Verify SPDX headers on source files                |

### Port 3000

`vite.config.ts` pins `port: 3000` and `strictPort: true`. OAuth
redirect URIs are registered with `localhost:3000`; if the server
changes port, sign-in and Drive connection break.

The Nitro preset is selected per mode: `vercel` in cloud mode,
`node-server` when `OPENEXPERT_MODE=local`.

## 5. Migrations

The schema is controlled by **hand-written SQL files** in
`drizzle/migrations/`. Drizzle is used in this project only as a
runner; `drizzle/schema.ts` is intentionally empty and **`db:generate`
is not used**.

To add a migration:

1. Create `drizzle/migrations/000N_description.sql` with the next
   correlative number.
2. Add the entry in `drizzle/migrations/meta/_journal.json` with the
   correlative `idx` and a millisecond timestamp.
3. Run `npm run db:migrate` with `DATABASE_URL` pointing at the target
   database.

> **Hash integrity.** Applied migrations are immutable: any fix
> requires a new migration.

> **Owner email.** Migrations `0002`, `0006` and `0010` read the owner
> email from the Postgres setting `app.owner_email` instead of a literal
> address, so the repository contains no personal data. Set it per
> environment before the first sign-in:
>
> ```sql
> ALTER DATABASE postgres SET app.owner_email = 'owner@example.com';
> ```
>
> If you already applied an earlier revision of these migrations, update
> the stored `drizzle.__drizzle_migrations` hashes or re-baseline the
> database.

For inspection without an external client: `npm run db:studio`.

## 6. Code conventions

- **File-based routes** in `src/routes/`. The router is TanStack
  Router: each file is a route. The single root layout is
  `__root.tsx`. `routeTree.gen.ts` is auto-generated and must not be
  edited by hand.
- **`.server.ts` modules** are imported exclusively from the server.
- **Validation at the edge with Zod.** Every server function declares
  an `inputValidator`.
- **Business-facing error messages in Spanish**; logs and developer
  messages in English.
- **Format with Prettier** before each commit.
- **No implicit `any`.**

## 7. Pre-flight verification

```sh
npm run typecheck
npm run lint
npm run test:run
npm run build
```

All commands must finish without errors.

## 8. Version control

- `.env` is **never** committed; it is in `.gitignore`. `.env.example`
  is committed.
- `.gitignore` also excludes backups, download files and local data
  (`openexpert.json`, `.openexpert/`, `credentials.json`).

## References

- [Architecture §3-§4](./02-architecture.md) — code map.
- [Data model §7](./03-data-model.md#7-migrations) — applied migrations.
- [Deployment](./08-deployment.md) — production steps.
- [OpenCore](./11-opencore.md) — local mode and the published MIT package.
