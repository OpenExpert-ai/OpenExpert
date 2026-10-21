# 08 · Despliegue

> **Audiencia:** ingeniería. No hay despliegue en la nube.

---

## 1. Formas de ejecutar OpenExpert

| Forma               | Comando                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Desarrollo          | `npm ci && npm run dev`                                                                    |
| Build de producción | `npm run build` y luego `node .output/server/index.mjs`                                    |
| Docker              | `docker run -p 3000:3000 -v openexpert-data:/data ghcr.io/openexpert-ai/openexpert:latest` |
| CLI                 | `npx @openexpert/openexpert serve`                                                         |
| Escritorio (Linux)  | `npm run desktop:install` y luego `openexpert`                                             |

| Forma               | Comando                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Desarrollo          | `npm ci && npm run dev`                                                                             |
| Build de producción | `npm run build` y luego `node .output/server/index.mjs`                                             |
| Docker              | `docker run -p 127.0.0.1:3000:3000 -v openexpert-data:/data ghcr.io/openexpert-ai/openexpert:local` |
| CLI                 | `npx @openexpert/openexpert serve`                                                                  |
| Escritorio (Linux)  | `npm run desktop:install` y luego `openexpert`                                                      |

La aplicación escucha en el puerto 3000 y **solo en la interfaz de bucle local**
(`127.0.0.1`). El panel no tiene autenticación: quien alcance el puerto puede
leer y escribir las carpetas que su dueño haya autorizado. Para exponerlo a una
red a propósito, define `OPENEXPERT_HOST` (o `HOST`) — por ejemplo
`OPENEXPERT_HOST=0.0.0.0 npx @openexpert/openexpert serve` — y piensa antes quién
comparte esa red: el servidor solo atiende los nombres que conoce (bucle local y
el de escucha) y responde 403 al resto.

El comodín dice **dónde escuchar, no qué nombres atiende**: los nombres con los
que vas a abrir la app — la IP de la LAN, o el dominio público si hay un proxy
inverso delante — van en `OPENEXPERT_ALLOWED_ORIGINS`, separados por comas, con
el puerto que lleve el `Host` (si no lo llevan, el de escucha). Sin esa lista el
`Origin` que manda el navegador es un nombre desconocido y `POST /api/chat`
responde 403: el chat no funciona.

```sh
OPENEXPERT_HOST=0.0.0.0 OPENEXPERT_ALLOWED_ORIGINS=http://192.168.1.10:3000 \
  npx @openexpert/openexpert serve
```

La imagen Docker escucha en todas las interfaces **dentro del contenedor** (así
funciona un puerto publicado), así que su aislamiento depende del prefijo
`127.0.0.1:` del puerto: no lo quites. Ver
[`docker/README.md`](../../docker/README.md). El preset de Nitro es `node-server`.

## 2. Docker

```sh
docker build -f docker/Dockerfile -t openexpert:local .
docker run --rm -p 127.0.0.1:3000:3000 -v openexpert-data:/data \
  -e OPENEXPERT_MODEL_PROVIDER=ollama openexpert:local
```

El workflow de release publica `latest`, `<version>` y `<sha>`. Para que un
`docker pull` anónimo funcione, el paquete tiene que ser público; si no lo es,
entra antes con `docker login ghcr.io` (un token con `read:packages`).

El puerto publicado se ata a `127.0.0.1` a propósito: la aplicación no tiene login. Ver
[`docker/README.md`](../../docker/README.md).

`docker/docker-compose.yml` también arranca un servicio Ollama:

```sh
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

## 3. OAuth de Google Drive

Basta con un cliente OAuth. Registra la URI de redirección:

| Entorno | URI                                          |
| ------- | -------------------------------------------- |
| Local   | `http://localhost:3000/auth/google/callback` |

Define `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (en `.env` o el entorno).
Deja la pantalla de consentimiento **In production** para que el refresh token
no caduque a los 7 días; consulta la
[FAQ de verificación OAuth](https://support.google.com/cloud/answer/9110914).

## 4. Copias de seguridad

Todo el estado es `OPENEXPERT_DATA_DIR`. Copia ese directorio para respaldar; el
fichero SQLite es `openexpert.db`.

El panel de ajustes (**Configuración → Datos y copias**) puede descargar una
copia en un único JSON (base de datos más `openexpert.json`, `secrets.json` y
`credentials.json`), restaurarla, borrar el historial de chat y compactar la
base de datos. Importar una copia reemplaza los datos actuales.

La restauración es todo o nada: los ficheros se aplican de uno en uno y, si uno
no se puede sustituir, los ya aplicados vuelven a su contenido anterior, así que
una copia que falla a medias deja la instalación como estaba. La base que se
reemplaza queda en `openexpert.db.bak` por si hay que volver atrás a mano.

El JSON cubre la base de datos y los tres ficheros canónicos. Las concesiones de
fuentes y el token de Notion (`drive-grants.json`, `local-roots.json`,
`notion.json`) **no** van dentro: para conservarlos, copia el directorio entero.

## 5. Actualizaciones

- Código: `git pull` / reinstala el paquete y reconstruye.
- Servidor descargado: `npx @openexpert/openexpert update`.

### La ventana de escritorio no tiene actualizador (decisión, no descuido)

`tauri.conf.json` no declara `plugins.updater`, no hay
`bundle.createUpdaterArtifacts` y `tauri-plugin-updater` no es una dependencia:
una instalación de escritorio se actualiza recompilándola y reinstalándola desde
el repositorio.

```sh
git pull && npm ci && npm run desktop:install
```

El servidor y la ventana son mitades independientes y no hay saludo de versión
entre ellas: una ventana instalada hace semanas sigue cargando lo que sirva el
servidor, así que un `git pull` que toque `src-tauri/` pide reinstalar la ventana
(y solo la ventana).

Para tener actualizaciones automáticas hace falta, como mínimo:

| Pieza                                                                            | Dónde va                                        |
| -------------------------------------------------------------------------------- | ----------------------------------------------- |
| Un par de claves (`npx tauri signer generate -w ~/.tauri/openexpert.key`)        | clave pública → `plugins.updater.pubkey`        |
| La clave privada y su contraseña                                                 | secretos del CI, nunca el repositorio           |
| `bundle.createUpdaterArtifacts: true`                                            | `src-tauri/tauri.conf.json`                     |
| `tauri-plugin-updater` y `.plugin(tauri_plugin_updater::Builder::new().build())` | `src-tauri/Cargo.toml`, `src-tauri/src/main.rs` |
| `plugins.updater.endpoints` apuntando a un manifiesto estático                   | `tauri.conf.json`, publicado con cada release   |
| Un paso que firme los artefactos                                                 | `.github/workflows/release.yml`                 |

Nada de esto se puede rellenar desde el repositorio: el par de claves se genera
una vez y lo guarda quien publica, y la clave pública tiene que coincidir con
ella. Mientras no exista, `.github/workflows/desktop-gate.yml` avisa de lo que
falta en cada pull request sin bloquearlo.

### Lista de comprobación antes de publicar la cáscara

Ocho bloques y qué los comprueba hoy:

| Bloque                    | Qué revisa                                                                                                                 | Dónde                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A · Identidad y versiones | una versión en el manifiesto, `tauri.conf.json`, `Cargo.toml` y `Cargo.lock`                                               | `npm run desktop:sync-version -- --check` (puerta) |
| B · Configuración         | `bundle.targets` coherente con `bundle.active`; cada ventana tiene capability; sin `remote`                                | `scripts/check-desktop-config.mjs` (puerta)        |
| C · Assets y frontend     | cada icono del bundle existe, es cuadrado y hay uno de 512; `frontendDist` existe con entrada                              | `scripts/check-desktop-config.mjs` (puerta)        |
| D · Instalador            | instalar en un `HOME` temporal, dos veces (idempotencia), `bash -n`, `desktop-file-validate`, un lanzador muerto falla     | `desktop-gate.yml`                                 |
| E · Humo de ejecución     | el servidor responde en un puerto libre; la ventana arranca bajo Xvfb; puerto ocupado sale ≠0; `PORT=3100` sigue al puerto | **sin automatizar**: hace falta compilar Rust      |
| F · Compatibilidad        | techo de `GLIBC_*` con `objdump`, `ldd` sin «not found», `.deb` construido en `ubuntu:22.04`                               | **sin automatizar**                                |
| G · Cadena de suministro  | `cargo audit`, `npm audit`, artefactos firmados, `attest-build-provenance`                                                 | **bloqueado por el par de claves del updater**     |
| H · Documentación         | `npm run check:docs`; que los comandos documentados hagan lo que dicen                                                     | `check:docs` en el CI, y los tests del CLI         |

`desktop-gate.yml` ejecuta A–D y H con `continue-on-error: true` a nivel de job:
un fallo se ve en la ejecución y en las anotaciones, pero no bloquea el pull
request. Quita esa marca cuando E y G dejen de ser manuales.

## 6. Aplicación de escritorio (Linux)

OpenExpert puede ejecutarse como una ventana nativa (Tauri + WebKitGTK) que se
abre con un único comando `openexpert`, instalado para el usuario actual (sin
`sudo`).

La ventana es solo una cáscara: el comando `openexpert desktop` arranca el
servidor local (lo reutiliza si ya está activo), espera a que responda, abre la
ventana y detiene el servidor cuando la ventana se cierra.

Requisitos para compilar la ventana: Node.js, un toolchain de Rust y las
librerías de desarrollo de WebKitGTK 4.1 (`webkit2gtk-4.1`, `libsoup-3.0`,
`gtk3`). El suelo práctico es Ubuntu 22.04 / Debian 12: son las versiones más
antiguas con `libwebkit2gtk-4.1` y glibc 2.35 o superior, y el CI construye el
`.deb` sobre `ubuntu-latest`.

```sh
npm run desktop:install     # compila la app + la ventana e instala el lanzador
openexpert                  # arranca el servidor y abre la ventana nativa
```

Qué instala:

| Ruta                                                       | Uso                         |
| ---------------------------------------------------------- | --------------------------- |
| `~/.local/bin/openexpert-desktop`                          | binario de la ventana       |
| `~/.local/bin/openexpert`                                  | lanzador (servidor+ventana) |
| `~/.local/share/applications/openexpert.desktop`           | entrada del menú de apps    |
| `~/.local/share/icons/hicolor/512x512/apps/openexpert.png` | icono                       |

`npm run desktop:uninstall` los elimina. Si la ventana sale en blanco en
Wayland, lánzala con `WEBKIT_DISABLE_DMABUF_RENDERER=1`.

`install.sh`, en la raíz del repositorio, instala las mismas cuatro piezas:
delega en `scripts/install-desktop.mjs` en vez de generar copias propias, y los
dos caminos comprueban el resultado — el lanzador tiene que ser bash válido, el
fichero que ejecuta tiene que existir, `Exec`/`TryExec` tienen que apuntar a
ejecutables y el icono tiene que ser de 512×512. `npm run desktop:check` hace esa
misma comprobación por su cuenta (sale con código distinto de cero si el lanzador
está muerto, que es lo que informa `install.sh --doctor`).

La ventana carga la URL que sirve el comando, no un puerto compilado dentro del
binario: `openexpert desktop` exporta `OPENEXPERT_DESKTOP_URL` y la cáscara
navega a ella, así que `PORT=3100 openexpert` abre 3100. Sin esa variable —un
binario lanzado directamente desde un paquete— la ventana vuelve a
`http://localhost:3000`.

`openexpert` **sin argumentos** abre la ventana; cualquier subcomando ejecuta el
CLI y no arranca la interfaz gráfica:

| Comando              | Qué hace                                               |
| -------------------- | ------------------------------------------------------ |
| `openexpert`         | arranca el servidor y abre la ventana                  |
| `openexpert doctor`  | revisa la configuración (sin ventana)                  |
| `openexpert fix`     | escribe lo que falte en la configuración (sin ventana) |
| `openexpert init`    | asistente de configuración (sin ventana)               |
| `openexpert serve`   | solo el servidor, para un navegador                    |
| `openexpert version` | la versión instalada                                   |

La cáscara no lleva interfaz embebida: `build.frontendDist` apunta a
`src-tauri/fallback/`, una única página estática que solo aparece si se abre la
ventana sin el orquestador y explica cómo arrancar el servidor. La aplicación web
siempre la sirve por HTTP el servidor local, así que los 1,7 MB de
`.output/public` no van dentro del binario.

### Una sola versión para la cáscara

La versión del producto es `packages/openexpert/package.json`. Rust no puede leer
un manifiesto JSON, así que tres ficheros llevan una copia —
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y la entrada
`openexpert-desktop` de `src-tauri/Cargo.lock` — y esta es la única forma
soportada de subirlas:

```sh
npm run desktop:sync-version              # escribe las tres copias
npm run desktop:sync-version -- --check   # distinto de cero si han divergido
```

`npm run version-packages` lo ejecuta después de `changeset version`, así que el
pull request de release ya lleva los tres ficheros, e `install.sh` se niega a
compilar cuando divergen. Un cambio de versión a mano tiene que tocar los tres.

### Paquetes distribuibles (deb, rpm, AppImage)

El lanzador por usuario de arriba es la vía recomendada en Linux. Para generar
paquetes:

```sh
npm run desktop:build                # -> src-tauri/target/release/bundle/
npx tauri build --bundles deb        # o un objetivo cada vez
```

`bundle.targets` es `"all"`, así que `desktop:build` genera todos los paquetes
que soporte la plataforma (`.deb`, `.rpm` y AppImage en Linux) en vez de terminar
en verde sin nada que publicar. Compilar la ventana ya no necesita `npm run build`
antes: la cáscara no lleva la aplicación web dentro.

La primera ejecución descarga las utilidades de empaquetado de Tauri (linuxdeploy,
AppRun). Estos paquetes llevan **solo la ventana** y su entrada de menú ejecuta
`openexpert-desktop`, así que el servidor local tiene que estar ya en marcha
(`npm run openexpert:serve`). Para el comportamiento "arranca el servidor y abre
la ventana", usa el lanzador por usuario (`npm run desktop:install`).

Sirven para distribuir la aplicación, no para instalarla en una máquina: la
instalación soportada en Linux es el lanzador por usuario, o `install.sh` en la
raíz del repositorio, que además es lo que instala el comando `openexpert`, la
entrada de menú y el icono.

## Referencias

- [Desarrollo](./07-desarrollo.md) — scripts.
- [Operación y soporte](./09-operacion-y-soporte.md) — diagnóstico.
