# @openexpert/openexpert

## 0.5.1

### Patch Changes

- 2cc57a0: Escritorio: el lanzador ya no inyecta `desktop` en todos los comandos, así que
  `openexpert doctor`, `fix`, `init`, `serve` y `version` ejecutan el CLI sin abrir
  la ventana (solo `openexpert` sin argumentos, o `openexpert desktop`, arranca la
  interfaz). La ventana carga el puerto que sirve el comando (`PORT=3100`) en vez
  del 3000 compilado en el binario, y el instalador comprueba lo que escribe: un
  lanzador que ejecuta un fichero que ya no existe falla en vez de darse por bueno.
  Una sola versión manda: `npm run desktop:sync-version` escribe
  `tauri.conf.json`, `Cargo.toml` y `Cargo.lock` desde el manifiesto del paquete.
- cbefb87: Cierra las rutas de fallo que dejaban la instalación muerta, colgada o sin rastro: la base de datos
  se reintenta tras un arranque fallido (antes quedaba envenenada hasta reiniciar), una copia de
  seguridad se valida antes de sustituir nada y deja la anterior en `openexpert.db.bak` con vuelta
  atrás, una `secret.key` dañada falla en voz alta en vez de regenerarse encima de los tokens, los
  patrones de inyección con cuantificadores anidados se rechazan (congelaban el servidor 59 s con 29
  caracteres), las llamadas a Drive y Notion llevan timeout, los fallos del registro de auditoría se
  registran con contexto y `run_python` ya no bloquea el bucle de eventos.
- 295634b: `run_python` deja de tener red: el script se ejecuta dentro de un espacio de nombres
  aislado (`bubblewrap`; si no está, `unshare -n`) y, cuando el sistema no puede crear
  ninguno, la herramienta se niega a ejecutar. Con `bubblewrap` tampoco ve el resto del
  disco. La descripción de la herramienta y la documentación dicen ahora exactamente eso.

  El despliegue Docker publica la app y Ollama solo en `127.0.0.1`, porque el panel no
  tiene login, y queda escrito en el compose y en `docker/README.md`.

  El control de origen de `/api/*` valida el `Host` y el `Origin` contra los hosts que el
  servidor sirve, no contra el `Host` de la petición: cierra el DNS rebinding. Un `POST`
  sin `Origin` ya no se da por bueno.

## 0.5.0

### Minor Changes

- 7cd398e: El paquete pasa a llamarse `@openexpert/openexpert` y su único binario es
  `openexpert`: el producto, el paquete, el CLI y la versión comparten un solo
  nombre. Las releases se etiquetan `v<versión>` y se titulan `OpenExpert <versión>`.
  El paquete anterior (`@openexpert/opencore`) queda obsoleto y señala a este; el CLI
  conserva la forma antigua del tag para poder descargar el bundle de una versión
  publicada antes del cambio.

## 0.4.0

### Minor Changes

- a000fc1: Una clave por proveedor: dos fichas del catálogo ya no pueden declarar la misma
  variable de clave, así que guardar la de un proveedor nunca pisa la de otro.
  OpenCode Go pasa a tener `OPENCODE_GO_API_KEY` en vez de compartir la ranura
  genérica. Preguntar a un proveedor qué modelos sirve pasa a ser un único camino
  de código (`listProviderModels`), que usan la aplicación y el CLI, y cubre el
  adaptador de Anthropic además de los endpoints compatibles.

## 0.3.1

### Patch Changes

- b710215: - `serve` and `desktop` start the local server on `127.0.0.1` instead of every
  interface, and `desktop` refuses a port owned by another application instead of
  pointing the window at it. `OPENEXPERT_HOST` (or `HOST`) exposes it on purpose.
  - `doctor` and `models` read the provider from the directory they were given,
    not from the process working directory.

## 0.3.0

### Minor Changes

- 096d377: Raise the default sampling `ai.temperature` from 0.2 to 0.5.
- 214e8a6: Add `notionClientId` to `openexpert.json` (the non-secret Notion OAuth client ID),
  mirroring `googleClientId`. The client secret stays in `secrets.json` /
  environment.
- d13e226: Remove the autonomous-process tools (`list_processes`, `request_process_run`) and
  the `processes` table name from the storage interface. The feature was a mock and
  has been removed from the app; see the roadmap to rebuild it for real.

### Patch Changes

- 83028ca: Normalise the Ollama base URL without the `/\/+$/` regex, which CodeQL reports as
  a polynomial ReDoS on a long run of slashes. Trailing slashes are now stripped
  with a loop; the `http://host`, `http://host/` and `http://host/v1` shapes keep
  behaving exactly as before.

## 0.2.1

### Patch Changes

- 3e4755d: Fix the release automation: use `changesets/action@v2`. `@changesets/cli@3` no
  longer prints the `New tag:` line that the v1 action parsed, so releases were
  published to npm but no git tags, GitHub releases or Docker images were created.

## 0.2.0

### Minor Changes

- 949ddf9: Add the `opencore desktop` command: it starts (or reuses) the local server and
  opens the native OpenExpert window (Tauri + WebKitGTK), then stops the server
  when the window closes.
- 949ddf9: OpenCore — the MIT engine and CLI of the local edition.

  - Model provider selector: `google` (Gemini), `ollama` (local) and
    `openai-compatible` (BYOK).
  - `config` loader (`openexpert.json` + `OPENEXPERT_*`), storage/token
    interfaces and the tool catalog.
  - CLI: interactive setup wizard plus `doctor`, `fix`, `models`, `serve` and
    `update`.
  - Built with `tsup` (ESM + `.d.ts`); `main`/`exports`/`types`/`files` set.

- a780ea0: Simplify the local edition surface:

  - Drop the unused `chat.defaultApproval` option from `ChatConfig`, the JSON
    schema and the settings panel.
  - `TableName`/`LOCAL_TABLES` now list the real local tables (`deals`,
    `accounts`, `settings`, …) instead of removed multi-user tables.
  - Normalise `OLLAMA_BASE_URL`: accept the native root or the `/v1` URL for both
    chat and model listing.

- 949ddf9: Require Node.js 24 or later (npm 11+). Node.js 20 is end-of-life and the
  build/test toolchain (Vite 8, Vitest 5, Changesets 3) now targets Node.js 24.
- 949ddf9: Add `chat.injectionExtraPatterns` to the configuration file, and wire the chat
  options (maxSteps, injection guard, retention) into the
  endpoint. Adds the advanced diagnostics and raw-config editor to the settings
  panel.
- 949ddf9: Extend `openexpert.json` with `ai` (temperature, topP, maxOutputTokens) and
  `chat` (maxSteps, injectionGuard, retentionDays) options, with
  matching JSON-schema and `loadConfig` support.
