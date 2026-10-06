# 08 · Deployment

> **Audience:** engineering. There is no cloud deployment.

---

## 1. Ways to run OpenExpert

| Way              | Command                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Development      | `npm ci && npm run dev`                                                                   |
| Production build | `npm run build` then `node .output/server/index.mjs`                                      |
| Docker           | `docker run -p 3000:3000 -v openexpert-data:/data ghcr.io/openexpert-ai/openexpert:local` |
| CLI              | `npx @openexpert/opencore serve`                                                          |
| Desktop (Linux)  | `npm run desktop:install` then `openexpert`                                               |

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
does not expire after 7 days; see the
[Google Cloud OAuth verification FAQ](https://support.google.com/cloud/answer/9110914).

## 4. Backups

The whole state is `OPENEXPERT_DATA_DIR`. Copy that directory to back up; the
SQLite file is `openexpert.db`.

The settings panel (**Configuration → Datos y copias**) can download a single
JSON backup (database plus `openexpert.json`, `secrets.json` and
`credentials.json`), restore it, clear the chat history and compact the
database. Importing a backup replaces the current data.

## 5. Updates

- Code: `git pull` / reinstall the package and rebuild.
- Downloaded server: `npx @openexpert/opencore update`.

## 6. Desktop application (Linux)

OpenExpert can run as a native window (Tauri + WebKitGTK) opened by a single
`openexpert` command, installed for the current user (no `sudo`).

The window is only a shell: the `openexpert desktop` command starts the local
server (reusing it if it is already running), waits for it to answer, opens the
window, and stops the server again when the window closes.

Prerequisites to compile the window: Node.js, a Rust toolchain and the
WebKitGTK 4.1 development libraries (`webkit2gtk-4.1`, `libsoup-3.0`, `gtk3`).

```sh
npm run desktop:install     # builds the app + window, installs the launcher
openexpert                  # starts the server and opens the native window
```

What it installs:

| Path                                                       | Purpose                    |
| ---------------------------------------------------------- | -------------------------- |
| `~/.local/bin/openexpert-desktop`                          | native window binary       |
| `~/.local/bin/openexpert`                                  | launcher (server + window) |
| `~/.local/share/applications/openexpert.desktop`           | application-menu entry     |
| `~/.local/share/icons/hicolor/512x512/apps/openexpert.png` | icon                       |

`npm run desktop:uninstall` removes them. If the window renders blank on
Wayland, launch it with `WEBKIT_DISABLE_DMABUF_RENDERER=1`.

## References

- [Development](./07-development.md) — scripts.
- [Operation & support](./09-operation.md) — diagnosis.
