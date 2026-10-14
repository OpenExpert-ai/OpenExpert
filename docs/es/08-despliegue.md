# 08 · Despliegue

> **Audiencia:** ingeniería. No hay despliegue en la nube.

---

## 1. Formas de ejecutar OpenExpert

| Forma               | Comando                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Desarrollo          | `npm ci && npm run dev`                                                                   |
| Build de producción | `npm run build` y luego `node .output/server/index.mjs`                                   |
| Docker              | `docker run -p 3000:3000 -v openexpert-data:/data ghcr.io/openexpert-ai/openexpert:local` |
| CLI                 | `npx @openexpert/opencore serve`                                                          |
| Escritorio (Linux)  | `npm run desktop:install` y luego `openexpert`                                            |

La aplicación escucha en el puerto 3000 y **solo en la interfaz de bucle local**
(`127.0.0.1`). El panel no tiene autenticación: quien alcance el puerto puede
leer y escribir las carpetas que su dueño haya autorizado. Para exponerlo a una
red a propósito, define `OPENEXPERT_HOST` (o `HOST`) — por ejemplo
`OPENEXPERT_HOST=0.0.0.0 npx @openexpert/opencore serve` — y piensa antes quién
comparte esa red. La imagen Docker sigue escuchando en todas las interfaces,
porque el puerto publicado es la razón del contenedor. El preset de Nitro es
`node-server`.

## 2. Docker

```sh
docker build -f docker/Dockerfile -t openexpert:local .
docker run --rm -p 3000:3000 -v openexpert-data:/data \
  -e OPENEXPERT_MODEL_PROVIDER=ollama openexpert:local
```

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

## 5. Actualizaciones

- Código: `git pull` / reinstala el paquete y reconstruye.
- Servidor descargado: `npx @openexpert/opencore update`.

## 6. Aplicación de escritorio (Linux)

OpenExpert puede ejecutarse como una ventana nativa (Tauri + WebKitGTK) que se
abre con un único comando `openexpert`, instalado para el usuario actual (sin
`sudo`).

La ventana es solo una cáscara: el comando `openexpert desktop` arranca el
servidor local (lo reutiliza si ya está activo), espera a que responda, abre la
ventana y detiene el servidor cuando la ventana se cierra.

Requisitos para compilar la ventana: Node.js, un toolchain de Rust y las
librerías de desarrollo de WebKitGTK 4.1 (`webkit2gtk-4.1`, `libsoup-3.0`,
`gtk3`).

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

### Paquetes distribuibles (deb, rpm, AppImage)

El lanzador por usuario de arriba es la vía recomendada en Linux. Para generar
paquetes:

```sh
npx tauri build --bundles deb,rpm,appimage   # -> src-tauri/target/release/bundle/
```

La primera ejecución descarga las utilidades de empaquetado de Tauri (linuxdeploy,
AppRun). Estos paquetes llevan **solo la ventana** y su entrada de menú ejecuta
`openexpert-desktop`, así que el servidor local tiene que estar ya en marcha
(`npm run opencore:serve`). Para el comportamiento "arranca el servidor y abre
la ventana", usa el lanzador por usuario (`npm run desktop:install`).

## Referencias

- [Desarrollo](./07-desarrollo.md) — scripts.
- [Operación y soporte](./09-operacion-y-soporte.md) — diagnóstico.
