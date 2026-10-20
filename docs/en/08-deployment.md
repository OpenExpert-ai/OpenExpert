# 08 · Deployment

> **Audience:** engineering. There is no cloud deployment.

---

## 1. Ways to run OpenExpert

| Way              | Command                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Development      | `npm ci && npm run dev`                                                                    |
| Production build | `npm run build` then `node .output/server/index.mjs`                                       |
| Docker           | `docker run -p 3000:3000 -v openexpert-data:/data ghcr.io/openexpert-ai/openexpert:latest` |
| CLI              | `npx @openexpert/openexpert serve`                                                         |
| Desktop (Linux)  | `npm run desktop:install` then `openexpert`                                                |

The app listens on port 3000, on the **loopback interface only** (`127.0.0.1`).
The dashboard has no authentication: whoever reaches the port can read and write
the folders its owner granted. To expose it to a network on purpose, set
`OPENEXPERT_HOST` (or `HOST`) — for example
`OPENEXPERT_HOST=0.0.0.0 npx @openexpert/openexpert serve` — after thinking about
who shares that network. The Docker image keeps binding every interface, because
the published port is the point of the container. The Nitro preset is
`node-server`.

## 2. Docker

```sh
docker build -f docker/Dockerfile -t openexpert:local .
docker run --rm -p 3000:3000 -v openexpert-data:/data \
  -e OPENEXPERT_MODEL_PROVIDER=ollama openexpert:local
```

The release workflow publishes `latest`, `<version>` and `<sha>`. For an
anonymous `docker pull` to work the package has to be public; if it is not, sign
in first with `docker login ghcr.io` (a token with `read:packages`).

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

The JSON bundle covers the database and the three canonical files. The source
grants and the Notion token (`drive-grants.json`, `local-roots.json`,
`notion.json`) are **not** inside it: to keep them, copy the whole directory.

## 5. Updates

- Code: `git pull` / reinstall the package and rebuild.
- Downloaded server: `npx @openexpert/openexpert update`.

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

Two internal variables override where `desktop` looks: `OPENEXPERT_DESKTOP_REPO`
(the source checkout the installer was built from) and `OPENEXPERT_DESKTOP_BIN`
(the window binary). The installer sets them; you do not need to.

### Distributable packages (deb, rpm, AppImage)

The per-user launcher above is the recommended path on Linux. To build packages
instead:

```sh
npx tauri build --bundles deb,rpm,appimage   # -> src-tauri/target/release/bundle/
```

`npm run desktop:build` and `npx tauri build` take the version pinned in
`src-tauri/tauri.conf.json`; `npm run desktop:install` injects the package's
version at build time, so the launcher always carries the product version.

The first run downloads Tauri's packaging helpers (linuxdeploy, AppRun). These
packages ship the **window only** and their menu entry runs
`openexpert-desktop`, so the local server must already be running
(`npm run openexpert:serve`). For the "start the server and open the window"
behaviour, use the per-user launcher (`npm run desktop:install`).

They are for distributing the app, not for installing it on a machine: the
supported Linux installation is the per-user launcher, or `install.sh` at the
repository root, which is also what installs the `openexpert` command, the menu
entry and the icon.

## References

- [Development](./07-development.md) — scripts.
- [Operation & support](./09-operation.md) — diagnosis.
