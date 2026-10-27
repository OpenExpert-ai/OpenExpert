# Changelog

OpenExpert follows [Semantic Versioning](https://semver.org/) and uses
[Changesets](https://github.com/changesets/changesets) to draft release
notes. This file is the reader's summary of notable changes per release; the
per-package detail lives in `packages/openexpert/CHANGELOG.md`.

## Unreleased

### El separador del CSV se lee del fichero, no se cuenta en la cabecera

- **La importación elegía el separador contando comas en la primera línea**, incluidas las que
  están dentro de un campo entrecomillado. Un CSV exportado con `;` —lo que escribe Excel en
  castellano— cuya cabecera llevara tantas comas como separadores tiene la tabla se partía por
  comas: las columnas desaparecían y todas las filas se rechazaban con «Falta client (cliente)»,
  un motivo que el fichero no tenía. Las filas no llegaban a la base; el daño era la importación
  fallida y el mensaje que culpaba al fichero.
- **Ahora manda la misma regla que el lector de archivos locales.** `src/lib/csv-text.ts` reúne
  `csvRecords` y `detectDelimiter` (módulo puro, sin `node:fs`): parte los primeros registros de
  cada candidato, cuenta solo los separadores fuera de comillas y exige que la tabla más ancha se
  repita en al menos la mitad de los registros, con la coma ganando el empate para no cambiar la
  forma de un fichero normal. `parseCsv` la usa y `local-fs.server.ts` importa la misma, así que
  las dos rutas que leen el mismo CSV ya no pueden describirlo de dos maneras.
- **La puerta es un test.** `src/lib/business-csv.separador.test.ts` importa un fichero con `;` y
  una cabecera «Notas, a, b, c» y exige sus dos facturas con importe 1200,50 y vencimiento
  correctos, y mantiene los controles de un CSV por comas y de un fichero de una sola columna;
  `src/lib/csv-text.test.ts` fija la regla (comillas, empate, tabulador, `|`, una columna, celda
  con salto de línea).

### El tope de filas del CSV dice cuántas quedaron fuera

- **El corte se contaba como una fila rota.** El importador acepta 5.000 filas y, al llegar al
  tope, apuntaba `{ row: i + 1, message: "Máximo 5000 filas por importación." }` como un error de
  fila más. Con una exportación de 5.237 negocios el panel enseñaba «Importados 5.000 registros» y
  «1 fila con error»: el usuario leía que le faltaba una fila cuando en realidad le faltaba un
  bloque de 237, y no había ningún número que se lo dijera.
- **Ahora el resultado publica `omitted`.** `parseBusinessCsv` cuenta las filas que el tope dejó sin
  leer (0 si el fichero cabe entero) y no las mete en `errors`; `importBusinessCsv` lo devuelve y el
  panel lo anuncia en su propio aviso, con el número y en las dos lenguas, sin llamarlas filas con
  error. El tope sigue siendo 5.000 y vive en `CSV_MAX_ROWS`.
- **La puerta es un test.** `src/lib/business-csv.tope.test.ts` fija los dos números con 5.237
  filas (5.000 leídas + 237 fuera), con una fila mala delante del tope (5.000 + 1 error + 236) y el
  caso sin tope, y `-settings.data.test.tsx` exige que el aviso diga 237 y no hable de filas con
  error.

### Una factura vence por su fecha, no por una etiqueta que nadie escribe

- **El filtro pedía un estado que ningún camino produce.** `overdueInvoices` decidía por
  `status === "overdue"`, y ese valor no lo escribe nadie: el importador de CSV guarda `open`
  cuando la fila no trae estado, el conector de Holded solo devuelve `paid`, `cancelled` u
  `open`, y los datos de ejemplo usan `open`/`paid`. Con datos reales, «¿qué facturas tengo
  vencidas?» contestaba que ninguna, y `propose_invoice_reminders` respondía «Ninguna de esas
  facturas está vencida», así que la tarjeta de reclamación de cobro no se podía llegar a
  proponer.
- **La fecha es la que decide.** Cuenta como vencida la factura cuyo `due_date` ya pasó —en días
  de calendario, con la misma cuenta que los días de retraso— y que no está pagada ni anulada.
  El `status` explícito `overdue` se sigue respetando tal cual, incluida la fila marcada a mano
  con fecha por llegar, que sale con 0 días.
- **La puerta es un test.** `src/lib/ee.vencidas.test.ts` inserta las facturas de los datos de
  ejemplo con su estado real (`open`) y exige que salgan con sus días exactos, que las pagadas y
  anuladas no cuenten, y que las que vencen hoy o más adelante tampoco.

### Una página de Notion con bloques muy anidados dice que está a medias

- **El recorte por profundidad se anuncia.** `readPage` desciende por los bloques hijos hasta un
  tope de profundidad y, al llegar, dejaba de bajar sin dejar rastro: el texto del nivel que no se
  leía no aparecía y `hasMore` volvía en `false`, que es justo la señal que el modelo lee como «esta
  es la página entera». Una lista dentro de un desplegable dentro de una cita se resumía sin su
  último nivel y sin avisar, y subir `maxBlocks` no lo arreglaba porque el tope que actuaba era de
  profundidad, no de número de bloques.
- **Se lee un nivel más y lo que queda se dice.** El tope sube a cuatro niveles de bloques (página,
  hijos, nietos y bisnietos) y, cuando un bloque del último nivel tiene hijos, `hasMore` sale en
  `true`: quien llama sabe que el texto no es la página entera aunque no haya agotado el presupuesto
  de bloques.
- **La nota y las instrucciones del chat distinguen los dos motivos**, para no mandar al modelo a
  subir `maxBlocks` cuando el corte es de anidamiento (donde no añade nada).
- **La puerta es un test.** `src/lib/notion.anidados.test.ts` sirve el árbol de bloques con un
  `fetch` doblado por id: con cuatro niveles exige el texto del cuarto y `hasMore: false`, y con
  cinco exige `hasMore: true`, el quinto nivel fuera del texto y el mismo veredicto con `maxBlocks:
1000`.

### El aviso de la importación de CSV cuenta las filas que se cayeron

- **El recuento sale de `skipped`, no del tamaño de la muestra.** El servidor ya devolvía
  `skipped` con el número real de filas rechazadas y `errors` recortado a las 20 primeras
  (`business.functions.ts`), y el panel contaba `errors.length`: con 45 filas malas el usuario leía
  «20 fila(s) con error» y no tenía forma de saber que había perdido 25 por el camino. Ese aviso es
  lo único que le dice qué entró en el panel, y es con lo que decide si vuelve a preparar el fichero.
- **Y no anuncia un éxito que no lo es.** El toast verde «Importados 0 registros de …» salía también
  cuando no entraba ninguna fila, así que un fichero entero rechazado se contaba primero como una
  importación con éxito y después con el recuento recortado. Ahora solo sale si `inserted + updated`
  es mayor que cero.
- **Lo que se calla el detalle se dice.** Cuando hay más rechazadas que muestra, el aviso añade
  «Se detallan solo las 20 primeras.», y el recuento concuerda («1 fila con error», «45 filas con
  error»).
- **La puerta es un test.** `src/routes/_authenticated/-settings.data.test.tsx` monta la ruta con
  las funciones de servidor dobladas: 45 rechazadas y 20 en el detalle exigen el 45 y la nota del
  recorte, el caso de 0 importadas exige que no se llame a `toast.success`, y una sola rechazada
  exige el singular.

### El Picker de Drive no se queda cargando sin decir nada

- **El arranque de la librería de Google tiene plazo.** `pickDriveFiles` resolvía con
  `window.gapi.load("picker", () => resolve())` y nada más: si `api.js` cargaba pero el módulo
  `picker` no arrancaba (un bloqueador que deja pasar la primera petición y corta la siguiente, una
  CSP que permite `apis.google.com` pero no lo que ese script pide después), el callback no llegaba
  nunca y la promesa quedaba pendiente para siempre.
- **Lo que veía el usuario:** el botón «Seleccionar archivos» giraba indefinidamente, sin mensaje y
  sin poder reintentar sin recargar la página; los otros dos caminos de carga sí fallaban con
  diagnóstico.
- **Ahora:** pasados 20 s la carga se rechaza con «El cargador de Google (gapi) no respondió en
  20 s…», el `finally` del llamador baja el estado de carga y el aviso dice qué comprobar. El fallo
  no se cachea, así que el siguiente clic vuelve a pedir la librería.
- **La puerta es un test.** `src/lib/drive-picker.test.ts` monta un `gapi.load` que no llama nunca a
  su callback, avanza 30 s de reloj falso y exige el rechazo; después reintenta y comprueba que la
  librería se vuelve a pedir.

### La importación de CSV rechaza la fecha que no existe

- **`parseDate` valida el día contra el calendario, no por rango.** Comprobaba que el día estuviera
  entre 1 y 31 y que el mes entre 1 y 12, y la rama ISO devolvía el texto sin mirarlo, así que
  `31/02/2026` y `2026-02-31` entraban como `2026-02-31` y la fila se guardaba sin un solo error.
  Ahora la comprobación es la ida y vuelta de `calendarDay` (`src/lib/calendar-day.ts`), el mismo
  lector que usa el resto de la aplicación: si el día no existe en su mes, no es una fecha.
- **Lo que no es una fecha ya no pasa como texto.** Antes `parseDate("pendiente")` devolvía
  `"pendiente"` y `parseDate("1/3/26")` lo mismo, y ese texto acababa en `due_date` o en
  `close_date`. Ahora devuelve `null`: en una factura la fila se rechaza con su número de línea y en
  un deal el cierre queda vacío. La celda vacía sigue siendo «falta el vencimiento», con su mensaje
  de siempre.
- **Por qué importaba:** `overdueInvoices` lee esas fechas con `daysSince`, que convierte el `null`
  de una fecha imposible en 0, así que la factura importada como vencida el 31 de febrero se
  quedaba con «0 días» de vencida para siempre y la herramienta `overdue_invoices` le decía lo mismo
  al modelo.
- **La puerta es un test.** `src/lib/business-csv.fechas.test.ts` fija los dos formatos imposibles, el
  bisiesto que sí existe (`29/02/2028`), el texto que no es fecha, el error con su línea en facturas y
  el cierre a `null` en deals.

### La retención del historial se aplica a toda la instalación

- **La poda ya no depende de qué Experto abras.** El ajuste `chat.retentionDays` es un solo número
  para la instalación y la pantalla lo presenta como la retención del historial, pero
  `listConversations` (`src/lib/data.functions.ts`) filtraba las filas por `expertId` y borraba solo
  las conversaciones caducadas de **ese** Experto: el historial de un Experto cuya lista no se abría
  se quedaba en `chat_messages` para siempre, porque no hay ningún otro sitio que pode. Ahora, al
  abrir la lista de cualquier Experto se recorre la tabla entera y se borran todos los hilos cuyo
  último mensaje está fuera del plazo, sean del Experto que se abre o no. La lista que se devuelve
  sigue siendo la del Experto pedido, en el mismo orden.
- **`0` sigue significando «sin purga»**, y nada de esto corre en segundo plano: es una consulta más
  sobre tres columnas cuando se pide la lista.
- **La puerta es un test.** El caso «la retención es de la instalación, no del Experto cuya lista se
  abre» en `src/lib/data.functions.test.ts` abre la lista de un Experto reciente y comprueba que el
  hilo caducado del otro desaparece de la tabla, no solo de la respuesta.

### Una base de una versión más nueva no se abre en silencio

- **La versión del esquema se comprueba antes de migrar, no después.** `applyMigrations`
  (`src/lib/db.server.ts`) se salta toda migración que la base da por aplicada, así que un
  `PRAGMA user_version` por delante de la última migración de esta build (hoy la 7) significaba que
  no se aplicaba ninguna y la aplicación seguía leyendo y escribiendo un esquema que nunca había
  visto: el fallo salía como un error de SQLite suelto («table experts has no column named
  domains»), que nombra el síntoma y no la causa. `getDb()` rechaza ahora esa base antes de tocar
  nada, y el mensaje dice las dos versiones (la de la base y hasta cuál entiende esta build) y qué
  hacer; el fichero queda byte a byte como estaba.
- **La restauración comprueba lo mismo, antes de escribir.** `assertValidDatabase`
  (`src/lib/backup.server.ts`) miraba la cabecera de SQLite y que sql.js leyera el esquema, pero
  nunca `user_version`; el `version` que sí rechazaba es el del **formato del paquete**, no el del
  esquema de la base. Como las copias viajan entre máquinas a propósito, una copia hecha con una
  build posterior entraba entera: ahora se rechaza con el mismo mensaje y sin tocar el destino —ni
  el `openexpert.db` ni su `.bak`—.
- **La puerta es un test.** `src/lib/db.future-schema.test.ts` marca una base real en 9999 y
  comprueba el rechazo de `getDb()` y de `restoreBackup` con el sha256 del fichero antes y después,
  más un control de que una base en la versión actual se sigue abriendo y migrando.

### A status is not a word, and «pending» is not Spanish

- **The activity log is translated in both directions.** The page printed the event `type` raw — it
  never went through `t()`, so with the interface in English the log read «Consulta», «Seguridad»,
  «Integración», «Drive · creación»… — and its status went to `t()` carrying the identifier stored in
  the database (`ok`, `pending`, `reverted`), which is English already: the English page was right by
  accident and the Spanish one showed English codes. The type is the Spanish source string, so it now
  goes through `t()` and its 13 values are dictionary keys; the status takes its label from
  `src/lib/activity-labels.ts` («Hecho», «Pendiente», «Revertido», «Denegado», «Fallido»,
  «Cancelado») before `t()`. The type filter keeps the raw value in `option value`, because with the
  translated text as the value the filter compared «Query» with «Consulta» and matched nothing.
- **The chat tool list has a label for every tool.** `TOOL_LABELS` had 24 entries for a 26-tool
  catalog, so `run_python` and `search_inside_files` were shown with their technical name in both
  languages; `Actualizando página en Notion` was in the map while the dictionary key said «de», so it
  also stayed in Spanish. The map moved to `src/lib/ai/tool-labels.ts` and `tool-labels.test.ts`
  crosses it with `Object.keys(createChatTools(...))` in both directions, so the next tool cannot
  ship without one.
- **The hole has a check.** `src/locales/activity-i18n.test.ts` collects the event types from the
  `logActivity({ type })` and `proposePending` calls with the TypeScript parser and fails when one of
  them has no English entry — the global check only reads literal `t(…)` keys and could not see them.

### «1 mensajes» is not a sentence

- **Every text with a count agrees in number, in both languages.** `countPhrase` already existed,
  but only the two summaries of `executePending` used it: clearing one message logged «Historial de
  chat borrado (1 mensajes)» and a single granted file read «(1 archivos concedidos)», while the
  window said «1 mensajes», «1 eventos», «1 modelos», «1 archivo(s)», «1 carpeta(s)» and
  «1 línea(s)». The plural now lives in one place: `pluralize(locale, n, one, other)` in
  `src/lib/translate.ts` picks the form and then translates it — both forms are dictionary keys, and
  the English coverage check collects them from every call — while messages that never reach the
  window (the activity log, the notes handed to the model) use `countPhrase`, moved to the same file
  and re-exported from `ee.server`. `src/locales/en.ts` gained the singular entries, the «(s)»
  spellings are gone, and the file-window note now says «1 línea».

### A Drive search is 100 files, not all of them

- **`search_drive` says how many matches it left out.** It filtered the files granted with the Picker
  and `.slice(0, 100)` returned `{ files }` with no count, so the model read 100 entries as the whole
  list and answered that the 101st file did not exist. The response now carries `total` with every
  match and, when the page is shorter than them, `hasMore: true` plus a note («Se listan 100 de 150
  coincidencias»); the tool description and the system prompt say so too, like `list_local_files`
  already did.

### A rejected setting is a sentence, not a JSON blob

- **The chat panel and the raw editor say which field broke which limit.** Both validate through
  `chatUpdateSchema` / `fileConfigSchema`, and both showed the `ZodError`'s own message in a toast:
  a JSON dump with `origin`, `code`, `maximum`, `inclusive` and the path in English, sitting on a
  screen that is otherwise in Spanish. The useful sentence (`maxSteps va de 1 a 200 pasos por
consulta`) travelled **inside** that dump, and the field was named without its branch
  (`maxSteps` on the panel, `["chat","maxSteps"]` on the editor). They now go through
  `describeConfigProblems` — the helper the backup restore already used — so the owner reads
  «chat.maxSteps: va de 1 a 200 pasos por consulta» on all three doors, with the same path.

### A local folder is not 5 000 files

- **The walk cap no longer travels as the folder size.** `listLocalFiles` stops at 5 000 files and
  8 levels deep — a guard, not a fact about the folder — and `list_local_files` was reporting
  `total: 5000` for a folder with 20 000, so the model answered «there is no file that mentions
  that» with the file inside the folder. The walk now returns `{ files, truncated }`, the tool sends
  `truncated: true` and `scanned` when it stopped early (and keeps `total` only when it is a real
  count), and its note names the cap.
- **`search_local_files` counts every match, not the 200 it shows.** It used to filter and
  `.slice(0, 200)` without a count, so 900 matches read as 200. Now it travels `total` and a note
  with «200 de 250 coincidencias».
- **`search_inside_files` tells the two reasons to stop apart.** Running out of hits means «there
  are more matches»; running out of files means «there are files I did not read». It said the first
  for both, so the model announced more matches when the rest were unopened files. Now the second
  case says how many files are left unread (`unscanned`) and, if the walk itself was cut, says so.

### The wildcard says where to listen, not which names are served

- **`OPENEXPERT_HOST=0.0.0.0` stops accepting any `Host`.** The name check had a
  wildcard branch that took every request whose `Host` ended in the listening
  port, so the server answered names nobody had declared — the opposite of what
  `SECURITY.md` and the deployment guide promise, and what the name allowlist was
  added for. A safe request that carries no `Origin` (every same-origin request a
  page makes, which is the whole DNS-rebinding shape) passed the origin check
  too, so a page served from `evil.test:3000` and re-pointed at loopback could
  ask for `GET /api/backup` and read the full bundle: `secrets.json`, the
  encrypted credentials and the `secret.key` that decrypts them. Names now come
  only from the configuration — loopback, the listen address and
  `OPENEXPERT_ALLOWED_ORIGINS` — and anything else is a 403, on every route. An
  installation that exposed the app on `0.0.0.0` without that list has to add it
  to keep opening the app from another machine.

## 0.5.0 — 2026-10-18

### One name and one version

- **The package is `@openexpert/openexpert`.** It used to be `@openexpert/opencore`, its CLI
  answered to `opencore`, and the documentation had a page named after it — with no note
  anywhere explaining why, so it read like a licensing strategy instead of a component.
  Renaming the package is a new name on npm: the old one is deprecated with a pointer, and
  the CLI (and the download of its bundle) keeps working for versions published before.
- **Releases carry the product's name.** They are tagged `v<version>` and titled
  `OpenExpert <version>`, instead of the package name changesets would use, and the bundle is
  attached to that same release.
- **One version.** The number in the interface (About) is the package's, and the root manifest
  is a private workspace file that only carries the `0.0.0` placeholder. The desktop shell takes
  the same number when it is built.
- The app's internal module that wraps the engine is `src/lib/engine/`, not `src/lib/opencore/`.

## 0.4.0 — 2026-10-18

### One key per provider

- **A provider's key is its own.** No two records in the catalogue may declare the same
  variable: instead of sharing the generic slot, OpenCode Go has `OPENCODE_GO_API_KEY`, and a
  test fails if a future record shares one. Saving a key could previously overwrite another
  provider's and the failure only appeared later, as a 401 from the provider that lost it.
- **Anthropic can be configured again.** Choosing it in the panel failed validation —the panel
  kept its own list of three providers— and there was no field for its key. Every record in
  the catalogue can now be selected, and each one shows its own key field, named after the
  variable where it is stored.
- Asking a provider which models it serves is one code path (`listProviderModels`), shared by
  the panel, the CLI and `doctor`. Anthropic and OpenCode Go used to be answered with Google's
  model list.
- The settings screen was rebuilt around the catalogue: the provider list, the key field, the
  endpoint and the model picker are rendered from the record, so nothing about a provider is
  written by hand in the interface and a missing key is reported by name.
- A missing key is no longer substituted by another provider's, and the label that says where
  a key lives now distinguishes a real environment variable from the copy the app loads out of
  `secrets.json`.

### Providers are data, not branches

- The model-provider configuration was rewritten around a catalogue: adapter, endpoint,
  key variable, headers, an optional **session header**, and models as records with cost,
  context, tool calling and reasoning. The provider identifier is derived from the
  catalogue, so a new provider is one record instead of three edits across a type, a
  validation and a factory. Keys are per provider rather than a shared slot.
- **Anthropic** joins as a provider, through its own adapter.
- **Copilot and the Nous portal are deliberately absent**, each with its reason written
  next to the catalogue: the first lends its service through its own extensions, the
  second is an OAuth account rather than an API key.

## 0.3.x and earlier — local-first rewrite

### Local-first rewrite (breaking)

- Removed **Supabase** (database and authentication) and **Vercel** entirely.
  The application is now single-owner and local-only: no login, no cloud.
- Persistence moved to **SQLite** (`sql.js` + Drizzle ORM) in a single file at
  `OPENEXPERT_DATA_DIR/openexpert.db`; schema in `drizzle/schema.ts` + `init.sql`.
- Removed multi-user features: `profiles`, `user_roles`, `expert_access`,
  `invitations`, the users screen and the login routes.
- Model providers are `ollama`, `google` and `openai-compatible`; the
  `openexpert` gateway provider is gone.
- Nitro preset is always `node-server`; run locally or with Docker.
- `@openexpert/openexpert` simplified to match (no mode/gateway/auth modules).
- Documentation and `AGENTS.md` rewritten for the local edition.

### Added

- **Scanned PDFs can be read with a model.** When a PDF has no text layer, the active
  provider transcribes it — literally, not as a summary, because the text feeds the content
  search and the windowed read. It is a **cloud call carrying the document**, so it ships
  **off** and happens only on an explicit read, never while a search walks a folder.

- **`run_python`: calculations done by code, not by eye.** A short Python script, run in a private
  temporary directory with a scrubbed environment, a hard timeout and capped output, and kept in the
  activity trail with the script that ran. It is a **capability**, off until enabled per Expert,
  because it means running code a model wrote. Standard library only.

- **Reading local files, upgraded**: `read_local_file` now returns the file in
  **windows of lines** (`offset`/`limit`, with `hasMore`/`nextOffset`) instead of one
  slab that silently dropped everything past the character cap. A new
  **`search_inside_files`** tool finds text _inside_ the contents — ignoring case and
  accents, and reporting the line — which the name-based search never could.
  Spreadsheets and CSV report **what the table is** (sheets, data rows, header
  columns), and `list_local_files` returns the first 200 files plus the total, so a
  big folder no longer floods the context.
- **`install.sh`**: one-command Linux installation — checks the system
  dependencies, builds the app and the desktop window, puts `openexpert` on the
  PATH and publishes the desktop entry that rofi, wofi, fuzzel, GNOME and KDE
  read.
- **MIT license for the entire repository**: code, docs and the OpenCore
  engine.
- **`@openexpert/openexpert`** with a build step (`tsup`), generated types, a
  JSON schema for `openexpert.json`, and a CLI (`init`, `doctor`, `fix`,
  `models`, `serve`, `update`).
- **`create-openexpert`** (`npm create openexpert`) to scaffold a project.
- **Desktop app (Linux)** via Tauri: the `openexpert` command starts the local
  server and opens a native window.
- **Settings panel** (`/settings`): model & AI, chat, data & backups,
  appearance and advanced options, in Spanish or English.
- **Example business data** seeded on first run (`deals`, `invoices`,
  `campaigns`, `accounts`) so the assistant has something to answer with.
- **Bilingual documentation** in `docs/en/` (primary) and `docs/es/`.
- **Continuous integration** (lint, format, licence headers, documentation
  links, typecheck, tests, build) and Docker images on GHCR.
- **Zero-config Docker Compose** (app + Ollama) and a five-minute quickstart.

### Changed

- The local server listens on `127.0.0.1` instead of every interface, so the
  dashboard is not reachable from whatever network the machine is joined to;
  `OPENEXPERT_HOST` (or `HOST`) exposes it on purpose.
- `package.json` declares `workspaces`, `engines` and `packageManager`.
- The chat settings no longer expose the unused "default approval" option.

### Fixed

- `@openexpert/openexpert` no longer reuses a port owned by another application for
  `serve`/`desktop`, and `doctor`/`models` read the provider from the directory
  they were given.
- A folder literally named `Trash` outside the XDG trash is no longer hidden in
  the file browser.
- `propose_pause_campaigns` no longer prints `CPA null€ (null%)` for a campaign
  with no conversions.
- `install.sh` no longer blames the Rust toolchain when `node_modules` is
  incomplete: it says what is actually missing.
- Reverting a process no longer drops its metadata: a snapshot now restores
  only the captured columns instead of replacing the whole row.
- `OLLAMA_BASE_URL` accepts either the native root (`http://localhost:11434`)
  or the `/v1` endpoint for both chat and model listing.
- Docker healthchecks point at `/` and no longer rely on `wget`, which the
  runtime image does not ship.
- Backup downloads reject cross-origin requests.

### Security

- The local server binds the loopback interface by default, so the dashboard,
  the chat and the file access are not on the network; the Docker image still
  binds every interface, which is why the published port is the point of the
  container.
- `.env`, `openexpert.json`, `~/.openexpert/`, `credentials.json` and
  `secrets.json` remain git-ignored and are never committed.
- `GET /api/backup` embeds credentials, so it now rejects cross-origin
  requests; the security guide documents this and the on-demand key reveal.
