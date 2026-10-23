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
who shares that network: the server answers only the names it knows (the loopback
ones and the one it listens on) and returns 403 to the rest.

The wildcard says **where to listen, not which names are served**: the names you
will actually open the app with — the LAN address, or the public domain when a
reverse proxy sits in front — go in `OPENEXPERT_ALLOWED_ORIGINS`, comma separated,
with the port the `Host` carries (the listening one when it carries none). Without
that list, any `Host` that is not a loopback name is answered with 403 on every
route, static files included: the app does not open at that address. And the
browser's `Origin` is an unknown name too, so `POST /api/chat` returns 403 even
when the `Host` is listed.

```sh
OPENEXPERT_HOST=0.0.0.0 OPENEXPERT_ALLOWED_ORIGINS=http://192.168.1.10:3000 \
  npx @openexpert/openexpert serve
```

The Docker image binds every interface **inside the container** (that is how a
published port works), so the container is private only because of the
`127.0.0.1:` prefix on the published port. Keep it: see
[`docker/README.md`](../../docker/README.md). The Nitro preset is `node-server`.

## 2. Docker

```sh
docker build -f docker/Dockerfile -t openexpert:local .
docker run --rm -p 127.0.0.1:3000:3000 -v openexpert-data:/data \
  -e OPENEXPERT_MODEL_PROVIDER=ollama openexpert:local
```

The release workflow publishes `latest`, `<version>` and `<sha>`. For an
anonymous `docker pull` to work the package has to be public; if it is not, sign
in first with `docker login ghcr.io` (a token with `read:packages`).

The published port is bound to `127.0.0.1` on purpose: the app has no login. See
[`docker/README.md`](../../docker/README.md).

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

A restore is all or nothing: the files are applied one by one, and if one of
them cannot be replaced the ones already applied go back to their previous
content, so a bundle that fails halfway leaves the installation as it was. The
database that gets replaced is kept in `openexpert.db.bak` in case it has to be
put back by hand.

The JSON bundle covers the database and the three canonical files. The source
grants and the Notion token (`drive-grants.json`, `local-roots.json`,
`notion.json`) are **not** inside it: to keep them, copy the whole directory.

## 5. Updates

- Code: `git pull` / reinstall the package and rebuild.
- Downloaded server: `npx @openexpert/openexpert update`.

### The desktop window has no updater (a decision, not an oversight)

`tauri.conf.json` declares no `plugins.updater`, there is no
`bundle.createUpdaterArtifacts` and `tauri-plugin-updater` is not a dependency: a
desktop installation is updated by rebuilding and reinstalling it from the
repository.

```sh
git pull && npm ci && npm run desktop:install
```

The server and the window are independent halves with no version handshake: a
window installed weeks ago keeps loading whatever the server serves, which is why
a `git pull` that touches `src-tauri/` needs a reinstall of the window (and only
of the window).

Automatic updates need, at least:

| Piece                                                                               | Where it goes                                   |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| A key pair (`npx tauri signer generate -w ~/.tauri/openexpert.key`)                 | public key → `plugins.updater.pubkey`           |
| The private key and its password                                                    | CI secrets, never the repository                |
| `bundle.createUpdaterArtifacts: true`                                               | `src-tauri/tauri.conf.json`                     |
| `tauri-plugin-updater` plus `.plugin(tauri_plugin_updater::Builder::new().build())` | `src-tauri/Cargo.toml`, `src-tauri/src/main.rs` |
| `plugins.updater.endpoints` pointing at a static manifest                           | `tauri.conf.json`, published by the release     |
| A step that signs the artefacts                                                     | `.github/workflows/release.yml`                 |

None of this can be filled in from the repository: the key pair is generated once
and kept by whoever publishes, and the public key has to match it. Until then,
`.github/workflows/desktop-gate.yml` reports the gap on pull requests without
blocking them.

### Release checklist for the desktop shell

Eight blocks, and what enforces each one today:

| Block                     | What it checks                                                                                                          | Where                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| A · Identity and versions | one version in the manifest, `tauri.conf.json`, `Cargo.toml` and `Cargo.lock`                                           | `npm run desktop:sync-version -- --check` (gate) |
| B · Configuration         | `bundle.targets` coherent with `bundle.active`; every window has a capability; no `remote`                              | `scripts/check-desktop-config.mjs` (gate)        |
| C · Assets and frontend   | every bundled icon exists, is square and 512 is among them; `frontendDist` exists with an entry                         | `scripts/check-desktop-config.mjs` (gate)        |
| D · Installer             | install in a temporary `HOME`, twice (idempotence), `bash -n`, `desktop-file-validate`, a dead launcher fails the check | `desktop-gate.yml`                               |
| E · Runtime smoke         | server answers on a free port; the window starts under Xvfb; a busy port exits non-zero; `PORT=3100` follows the port   | **not automated**: needs a Rust build            |
| F · Compatibility         | `GLIBC_*` ceiling via `objdump`, `ldd` without "not found", `.deb` built on `ubuntu:22.04`                              | **not automated**                                |
| G · Supply chain          | `cargo audit`, `npm audit`, signed artefacts, `attest-build-provenance`                                                 | **blocked on the updater key pair**              |
| H · Documentation         | `npm run check:docs`; the documented commands do what they say                                                          | `check:docs` in CI, and the CLI tests            |

`desktop-gate.yml` runs A–D and H with `continue-on-error: true` at job level: a
failure shows up in the run and in the annotations, but it does not block the
pull request. Remove that flag when E and G stop being manual.

## 6. Desktop application (Linux)

OpenExpert can run as a native window (Tauri + WebKitGTK) opened by a single
`openexpert` command, installed for the current user (no `sudo`).

The window is only a shell: the `openexpert desktop` command starts the local
server (reusing it if it is already running), waits for it to answer, opens the
window, and stops the server again when the window closes.

Prerequisites to compile the window: Node.js, a Rust toolchain and the
WebKitGTK 4.1 development libraries (`webkit2gtk-4.1`, `libsoup-3.0`, `gtk3`).
Ubuntu 22.04 / Debian 12 are the practical floor: they are the oldest releases
that ship `libwebkit2gtk-4.1` and glibc 2.35+, and the CI builds the `.deb` on
`ubuntu-latest`.

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

`install.sh` at the repository root installs the same four pieces: it delegates
in `scripts/install-desktop.mjs` instead of generating its own copies, and both
paths verify the result — the launcher has to be valid bash, the file it `exec`s
has to exist, `Exec`/`TryExec` have to point at executables and the icon has to
be 512×512. `npm run desktop:check` runs the same verification on its own (it
exits non-zero on a dead launcher, which is what `install.sh --doctor` reports).

The window loads the URL the command is serving, not a port compiled into the
binary: `openexpert desktop` exports `OPENEXPERT_DESKTOP_URL` and the shell
navigates to it, so `PORT=3100 openexpert` opens 3100. Without that variable — a
binary started straight from a package — the window falls back to
`http://localhost:3000`.

`openexpert` **with no arguments** opens the window; any subcommand runs the CLI
and never starts the graphical interface:

| Command              | What it does                                            |
| -------------------- | ------------------------------------------------------- |
| `openexpert`         | starts the server and opens the window                  |
| `openexpert doctor`  | checks the configuration (no window)                    |
| `openexpert fix`     | writes what is missing in the configuration (no window) |
| `openexpert init`    | configuration wizard (no window)                        |
| `openexpert serve`   | server only, for a browser                              |
| `openexpert version` | the installed version                                   |

The shell embeds no frontend: `build.frontendDist` points at `src-tauri/fallback/`,
one static page that only appears if the window is opened without the orchestrator
and explains how to start the server. The web app is always served over HTTP by
the local server, so the 1.7 MB of `.output/public` is not baked into the binary.

### One version for the shell

The product's version is `packages/openexpert/package.json`. Rust cannot read a
JSON manifest, so three files carry a copy — `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` and the `openexpert-desktop` entry in
`src-tauri/Cargo.lock` — and this is the only supported way to bump them:

```sh
npm run desktop:sync-version              # writes the three copies
npm run desktop:sync-version -- --check   # non-zero if they drifted
```

`npm run version-packages` runs it after `changeset version`, so the release pull
request already carries the three files, and `install.sh` refuses to build when
they diverge. A bump done by hand has to touch all three.

### Distributable packages (deb, rpm, AppImage)

The per-user launcher above is the recommended path on Linux. To build packages
instead:

```sh
npm run desktop:build                        # -> src-tauri/target/release/bundle/
npx tauri build --bundles deb                # or one target at a time
```

`bundle.targets` is `"all"`, so `desktop:build` produces every package the
platform supports (`.deb`, `.rpm` and AppImage on Linux) instead of finishing in
green with nothing to publish. Building the window does not need `npm run build`
first: the shell does not embed the web app. The first run downloads Tauri's
packaging helpers (linuxdeploy, AppRun). These
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
