# 08 · Running it

> **Audience:** engineering. There is no cloud deployment.

---

## 1. Ways to run OpenExpert

| Way              | Command                                                                                |
| ---------------- | -------------------------------------------------------------------------------------- |
| Development      | `npm ci && npm run dev`                                                                |
| Production build | `npm run build` then `node .output/server/index.mjs`                                   |
| Docker           | `docker run -p 3000:3000 -v openexpert-data:/data ghcr.io/openexpert/openexpert:local` |
| CLI              | `npx @openexpert/opencore serve`                                                       |

The app listens on port 3000. The Nitro preset is `node-server`.

## 2. Docker

```sh
docker build -f docker/Dockerfile -t openexpert:local .
docker run --rm -p 3000:3000 -v openexpert-data:/data \
  -e OPENEXPERT_MODEL_PROVIDER=ollama openexpert:local
```

`docker/docker-compose.yml` also starts an Ollama service:

```sh
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

## 3. Google Drive OAuth

One OAuth client is enough. Register the redirect URI:

| Environment | URI                                          |
| ----------- | -------------------------------------------- |
| Local       | `http://localhost:3000/auth/google/callback` |

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (in `.env` or the
environment). Leave the consent screen **In production** so the refresh token
does not expire after 7 days. See
[Integrations](./06-integrations.md#25-consent-status-in-production).

## 4. Backups

The whole state is `OPENEXPERT_DATA_DIR`. Copy that directory to back up; the
SQLite file is `openexpert.db`.

## 5. Updates

- Code: `git pull` / reinstall the package and rebuild.
- Downloaded server: `npx @openexpert/opencore update`.

## References

- [Development](./07-development.md) — scripts.
- [Operation & support](./09-operation.md) — diagnosis.
