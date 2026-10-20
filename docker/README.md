# OpenExpert in Docker

`Dockerfile` builds the local edition (Nitro `node-server` preset);
`docker-compose.yml` runs it together with an Ollama service.

## Security: this container has no login

OpenExpert is a single-owner app and **does not implement authentication**. Anyone
who can reach the port can read and write the workspace, list the granted local
folders, reveal the stored provider API keys and download the backup, which
contains `secrets.json` and the Google credentials.

Because of that, both services in `docker-compose.yml` are published **on
loopback only**:

```yaml
ports:
  - "127.0.0.1:3000:3000" # not "3000:3000": that is the whole LAN
  - "127.0.0.1:11434:11434"
```

Inside the container the server still listens on every interface (that is how a
published port works), so the bind address in `ports:` is the only thing keeping
the app private. Do not remove the `127.0.0.1:` prefix, and do not run
`docker run -p 3000:3000` on a machine that shares its network.

Exposing it is a decision with consequences: put the app behind a reverse proxy
that authenticates, or bind the published port to an address only you can reach,
and assume that whoever gets past it owns the data. If you do expose it, also set
`OPENEXPERT_HOST=0.0.0.0`: the server answers only `Host` names it was configured
for and returns 403 to the rest, which is what keeps DNS rebinding out. A wildcard
says where to listen, not which names are served, so name the ones you will use in
`OPENEXPERT_ALLOWED_ORIGINS` (comma separated, `host:port` or a full origin): the
LAN address, or the proxy's public domain. Without it the browser's `Origin` is a
host the server does not know and `POST /api/chat` answers 403 — the chat does not
work, and neither does anything else that fetches `/api/*` with an `Origin`.

## Run it

```sh
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
# open http://localhost:3000
```

Data (database, configuration, credentials) lives in the `openexpert-data`
volume, mounted at `/data` (`OPENEXPERT_DATA_DIR`).

To use a different provider:

```sh
OPENEXPERT_MODEL_PROVIDER=google GOOGLE_API_KEY=... \
  docker compose -f docker/docker-compose.yml up -d
```

Without compose:

```sh
docker build -f docker/Dockerfile -t openexpert:local .
docker run --rm -p 127.0.0.1:3000:3000 -v openexpert-data:/data openexpert:local
```
