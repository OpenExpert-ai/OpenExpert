# 08 · Deployment

> **Audience:** engineering. Production deployment and domain
> configuration. Local mode (§7) requires no deployment.

---

## 1. Component distribution

| Piece                       | Location                                                   |
| --------------------------- | ---------------------------------------------------------- |
| Database and authentication | Supabase (managed project, EU region)                      |
| Application                 | Vercel                                                     |
| Google credentials          | Google Cloud project with Drive API and OAuth client       |
| Model key                   | Google AI Studio (cloud) or Ollama / your endpoint (local) |

## 2. First deployment (cloud)

```sh
npx vercel link
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add GOOGLE_CLIENT_SECRET production
npx vercel env add GOOGLE_API_KEY production
npx vercel env add GOOGLE_OAUTH_STATE_SECRET production
npx vercel env add PUBLIC_APP_URL production
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_PUBLISHABLE_KEY production
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
npx vercel env add VITE_SUPABASE_PROJECT_ID production
npx vercel env add GOOGLE_CLIENT_ID production
npx vercel deploy --prod
```

Vercel detects Vite automatically. The Nitro preset is `vercel` in
cloud mode and `node-server` in local mode.

> `VITE_*` variables are baked into the bundle at build time: changing
> them requires a redeploy.

No variable values are committed; they are configured in Vercel or in
`.env` locally (see `.env.example`).

## 3. Registering the domain in three systems

| #   | Where                                   | What to register                        |
| --- | --------------------------------------- | --------------------------------------- |
| 1   | Google Cloud → OAuth client → redirects | `https://<domain>/auth/google/callback` |
| 2   | Supabase Auth → `site_url`              | `https://<domain>`                      |
| 3   | Supabase Auth → allowed redirects       | `https://<domain>/**`                   |

### 3.1. `site_url` vs allow list

The application returns to `<origin>/auth`, so the effective validation
falls on the allow list. If you update the list without `site_url`, the
session silently redirects to localhost with no visible error. Update
both values together.

### 3.2. Preview domains

For ephemeral environments, add the pattern:

```text
https://<project>-*.vercel.app/**
```

## 4. Google OAuth client

A **single** client serves both sign-in (Supabase Auth) and Drive (the
application). Both families of URIs must be registered:

| Flow              | URI to register                                      |
| ----------------- | ---------------------------------------------------- |
| Sign-in           | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Drive, local      | `http://localhost:3000/auth/google/callback`         |
| Drive, production | `https://<domain>/auth/google/callback`              |

Google propagates changes in 1–5 minutes. The consent screen must be
**In production** (see [06-integrations](./06-integrations.md#25-consent-status-in-production)).

## 5. Post-deployment verification

1. The application responds at `https://<domain>/auth` (200).
2. Sign-in redirects to Google, not to localhost.
3. Auth confirms Google enabled and email/password disabled.
4. _Integrations → Sources_ connects Drive requesting only Drive
   access.
5. Chat responds with tools and logs to activity.

## 6. Updates, revert, backups

Vercel keeps the history; revert is done from the panel or by command.

> Database changes are not reverted with code. Migrations are fixed
> only with a new migration.

The free database plan does not include point-in-time recovery:
periodic (monthly) logical export outside the repository is
recommended, as is a copy of Vercel's variables.

## 7. Local mode (OpenCore): no deployment

```sh
cp openexpert.json.example openexpert.json
OPENEXPERT_MODE=local npm run dev   # http://localhost:3000
npm run opencore:doctor
```

With `OPENEXPERT_MODEL_PROVIDER=ollama` no external key is required.
Data lives in `OPENEXPERT_DATA_DIR` (default `~/.openexpert/`).

The published Docker image runs the same setup with no host Node.js
required:

```sh
docker run --rm -p 3000:3000 \
  -v openexpert-data:/data \
  -e OPENEXPERT_MODEL_PROVIDER=ollama \
  ghcr.io/openexpert/openexpert:latest
```

## References

- [Development](./07-development.md) — scripts and migrations.
- [Integrations](./06-integrations.md) — Drive OAuth flow.
- [Operation & support](./09-operation.md) — costs and diagnosis.
