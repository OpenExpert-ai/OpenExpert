# 07 · Desarrollo

> **Audiencia:** equipo de ingeniería.

---

## 1. Requisitos

| Herramienta | Versión       |
| ----------- | ------------- |
| Node.js     | 24 o superior |
| npm         | 11 o superior |

## 2. Puesta en marcha

```sh
npm ci
cp openexpert.json.example openexpert.json   # opcional; los defectos valen
npm run dev                                 # http://localhost:3000
```

En un clon nuevo, `npm ci` también construye `packages/openexpert` (su script
`prepare`), así que el CLI queda listo.

## 3. Variables de entorno

Documentadas en `.env.example`. Lo esencial:

| Variable                                                                                | Función                                                                            |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `OPENEXPERT_MODEL_PROVIDER`                                                             | `ollama` \| `google` \| `anthropic` \| `openai-compatible` \| `opencode-go`        |
| `OPENEXPERT_MODEL_ID`                                                                   | Identificador del modelo                                                           |
| `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY` / `OPENCODE_GO_API_KEY` / `OPENEXPERT_MODEL_KEY` | Una clave por proveedor: Gemini, Claude, OpenCode Go y tu propio endpoint          |
| `OPENEXPERT_BASE_URL`                                                                   | Endpoint de `openai-compatible`, el único que pones tú                             |
| `OLLAMA_BASE_URL`                                                                       | Endpoint de Ollama                                                                 |
| `OPENEXPERT_DATA_DIR`                                                                   | Directorio de datos (por defecto `~/.openexpert/`)                                 |
| `GOOGLE_CLIENT_ID` / `OPENEXPERT_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`             | OAuth de Drive (opcional)                                                          |
| `GOOGLE_REDIRECT_URI` / `GOOGLE_OAUTH_STATE_SECRET`                                     | OAuth de Drive (opcional)                                                          |
| `GOOGLE_PICKER_API_KEY` / `GOOGLE_PICKER_APP_ID`                                        | Google Picker: el selector de ficheros de Drive en el navegador                    |
| `PUBLIC_APP_URL`                                                                        | Origen público para la URI de redirección de Drive                                 |
| `OPENEXPERT_PRIVACY_URL`                                                                | URL de la política de privacidad que se muestra antes de activar Drive             |
| `OPENEXPERT_NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET`                                  | OAuth de Notion (opcional)                                                         |
| `NOTION_REDIRECT_URI` / `NOTION_OAUTH_STATE_SECRET`                                     | OAuth de Notion (opcional)                                                         |
| `OPENEXPERT_HOST` / `HOST` / `PORT`                                                     | Interfaz y puerto del servidor local (bucle local y 3000 por defecto)              |
| `OPENEXPERT_ALLOWED_ORIGINS`                                                            | Nombres extra a los que atiende (IP de la LAN, dominio del proxy), por comas       |
| `OPENEXPERT_LOG_LEVEL`                                                                  | `debug` \| `info` \| `warn` \| `error` (por defecto `debug`, `info` en producción) |

`.env` está en `.gitignore`. El asistente del CLI guarda los secretos en
`~/.openexpert/secrets.json`, que el servidor carga en el entorno al arrancar
(las variables ya definidas tienen prioridad), de modo que `npm run dev` y
`openexpert serve` se comportan igual.

### Ficheros de configuración y panel de ajustes

El panel de **Configuración** (`/settings`) edita los mismos ficheros canónicos
que usa el CLI:

- `openexpert.json` — proveedor, modelo, muestreo (`ai`) y opciones de chat.
- `~/.openexpert/secrets.json` (permisos `0600`) — claves de API.

Precedencia al leer: variables de entorno reales > `openexpert.json` >
`secrets.json` > valores por defecto. El servidor carga ambos ficheros en
`process.env` al arrancar y refleja los cambios del panel en caliente, así que
un cambio surte efecto sin reiniciar. Las preferencias de interfaz (tema,
densidad, idioma) viven en la tabla `settings` de la base SQLite.

El idioma de la interfaz (español/inglés) es una de esas preferencias; la capa
de i18n del cliente está en `src/lib/i18n.tsx` con el diccionario inglés en
`src/locales/en.ts` (el español es el idioma fuente). Una entrada que falte no es
un error: `translate` cae al texto en español, así que un hueco se ve como español
colándose en el modo inglés en vez de romper nada. `src/locales/en.test.ts` lee
con el parser de TypeScript cada `t("…")` literal de `src/` y falla cuando alguno
no tiene entrada, para que el hueco no vuelva sin que nadie lo note; las claves
calculadas en tiempo de ejecución quedan fuera de esa comprobación.

Un valor que viene de la base es el mismo en las dos lenguas, así que no puede ser
clave del diccionario por sí solo: el registro de actividad guarda el `type` del
evento («Consulta», «Drive · creación») y su `status` (`ok`, `pending`,
`reverted`…). El tipo ya es la cadena fuente en español y pasa por `t()` tal cual;
el estado lleva un identificador en inglés, así que toma su etiqueta de
`src/lib/activity-labels.ts` antes de `t()`. Las dos partes están cubiertas: los
tipos se recogen de las llamadas a `logActivity({ type })` y a `proposePending` en
`src/locales/activity-i18n.test.ts`, y las etiquetas de las herramientas del chat
(`src/lib/ai/tool-labels.ts`) se cruzan con el catálogo real en
`src/lib/ai/tool-labels.test.ts`, que es como una herramienta nueva deja de salir
con su nombre técnico en pantalla.

Un texto con recuento pasa por `pluralize(locale, n, singular, plural, params)` en
`src/lib/translate.ts`, que elige la forma y después la traduce: `t()` interpola
pero no pluraliza, así que un plural fijo decía «1 mensajes». Las dos formas son
claves del diccionario y esa misma comprobación las recoge de cada llamada a
`pluralize(...)`. Los textos de servidor que no llegan a la ventana (la actividad,
las notas que recibe el modelo) usan `countPhrase(n, singular, plural)`, que no
tiene diccionario detrás.

La página de Fuentes de datos
(`src/routes/_authenticated/integrations.sources.tsx`) tiene además su propia
comprobación, `-integrations.sources.test.ts`: recorre el AST de la página y falla
ante cualquier texto visible que no pase por `t()`, toasts y `aria-label`
incluidos. Un literal escrito a mano no entra en la comprobación global —nunca
llega a ser una clave— y se queda en español sin que nada avise.

## 4. Scripts

| Script                            | Función                                             |
| --------------------------------- | --------------------------------------------------- |
| `npm run dev`                     | Servidor de desarrollo en el puerto **3000** (fijo) |
| `npm run build`                   | Build de producción (Nitro `node-server`)           |
| `npm run preview`                 | Sirve el build                                      |
| `npm run lint` / `lint:fix`       | ESLint                                              |
| `npm run format` / `format:check` | Prettier                                            |
| `npm run typecheck`               | TypeScript sin emitir (app + paquete)               |
| `npm run test:run` / `npm test`   | Tests (app + paquete)                               |
| `npm run openexpert:doctor`       | Diagnóstico del CLI                                 |
| `npm run openexpert:serve`        | Arranca la app con el CLI                           |
| `npm run license:check`           | Verifica cabeceras SPDX                             |
| `npm run test:coverage`           | Tests con umbrales de cobertura                     |
| `npm run check:docs`              | Enlaces de la documentación                         |
| `npm run check:commits`           | DCO + Conventional Commits (CI)                     |
| `npm run build:dev`               | Build en modo development                           |
| `npm run desktop:dev`             | Ventana Tauri en desarrollo                         |
| `npm run desktop:build`           | Build de Tauri sin inyectar la versión              |
| `npm run changeset`               | Redacta el changeset de la próxima release          |
| `npm run version-packages`        | Aplica los changesets pendientes en local           |
| `npm run release`                 | Compila y publica con Changesets                    |

### Puerto 3000

`vite.config.ts` fija `port: 3000` y `strictPort: true`; la URI de redirección
OAuth de Drive depende de él. El preset de Nitro es siempre `node-server`.

## 5. Base de datos

El esquema es `drizzle/schema.ts` (Drizzle) más `drizzle/init.sql` (DDL base).
`src/lib/db.server.ts` abre el fichero SQLite, aplica el DDL base, ejecuta las
migraciones pendientes y siembra la configuración (Expertos e integraciones).

**Cambios de esquema:** mantén `schema.ts` e `init.sql` en sync para las
instalaciones nuevas y añade un fichero numerado en `drizzle/migrations/`
(p. ej. `0002_add_x.sql`) para las bases existentes. El runner los aplica en
orden según `PRAGMA user_version`, así que una base antigua se actualiza al
arrancar. La numeración tiene huecos históricos (no hay `0003`): lo que cuenta
es el orden y el `user_version`, no que el siguiente fichero sea el entero
siguiente.

Tras cualquier escritura, llama a `await persist()`: volcará el fichero de forma
atómica (`.tmp` + `rename`).

## 6. Convenciones de código

- Rutas por fichero en `src/routes/`; `routeTree.gen.ts` es autogenerado.
- Los módulos `.server.ts` son solo de servidor.
- Validación en el borde con Zod; mensajes de usuario en español.
- Formato con Prettier; sin `any` implícito.

## 7. Verificación previa

```sh
npm run typecheck
npm run lint
npm run test:run
npm run build
```

`typecheck` encadena también el paquete (`npm run typecheck --workspaces`, lo mismo
que corre CI) y `test:run` ejecuta en una sola pasada los tests de la app y los de
`packages/openexpert/test`. Un test nuevo no hay que registrarlo en ningún sitio:
`src/puertas-cobertura.test.ts` recorre el repo y falla nombrando cualquier
`*.test.ts(x)` que el proyecto raíz de vitest no ejecute.

El comando que corre CI es `npm run test:coverage` (todos los ficheros a la vez, con
el proveedor v8), no `test:run`. El plazo de cada test sigue siendo el defecto de
5 s y no se sube en `vitest.config.ts`: un test que no quepa en él declara su propio
límite como último argumento del `it(...)` o del `waitFor(...)`, para que un
cuelgue de verdad en cualquier otro test siga saliendo en 5 s.
`src/plazos-test-lentos.test.ts` vigila los dos ficheros que ya rozaban el límite.

## 8. Integración continua y publicaciones

Todo cambio llega a `main` a través de una pull request: la rama está protegida
por un ruleset (sin escrituras directas, sin force-push, sin borrado), y
[`.github/required-checks.md`](../../.github/required-checks.md) guarda la
versión de ese ruleset que además hace que los checks bloqueen el merge — hoy un
run en rojo se puede mergear igual, que es como entró rota la pull request #48.

La ventana de escritorio y el smoke test de Docker son jobs de `ci.yml`
condicionados a los ficheros que construyen, así que una pull request de
documentación no paga ninguno de los dos. No hay ejecución en el push a `main`:
la pull request ya validó ese árbol.

| Workflow             | Se ejecuta con                                      | Qué hace                                                                                                                               |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`             | PRs a `main`, manual                                | lint, formato, licencias, enlaces, tipos, tests, build; la ventana de escritorio y el smoke test de Docker cuando cambian sus entradas |
| `codeql.yml`         | PRs a `main`, semanal                               | análisis de CodeQL                                                                                                                     |
| `scorecard.yml`      | semanal, cambios en la protección de rama, manual   | OpenSSF Scorecard                                                                                                                      |
| `pages.yml`          | cambios en `site/`, manual                          | despliega el sitio estático en GitHub Pages                                                                                            |
| `release.yml`        | push a `main` (salvo `docs/**` y `site/**`), manual | versiona/publica con Changesets, adjunta el bundle del servidor y construye la imagen                                                  |
| `server-release.yml` | manual                                              | repara una release que se quedó sin el bundle del servidor (`-f tag=<tag>`)                                                            |

Cinco workflows corren con disparadores propios (`ci`, `codeql`, `scorecard`,
`pages`, `release`); `server-release.yml` solo existe como herramienta manual de
reparación.

Reglas que mantienen la CI fiable:

- Cada `uses:` está fijado a un SHA de commit completo con la versión en un
  comentario final; Dependabot actualiza ambos. No sustituyas un SHA por una
  etiqueta móvil.
- Las herramientas que se descargan en tiempo de ejecución (`actionlint`,
  `gitleaks`) se bajan en una versión fija y se comprueban contra el
  `*_checksums.txt` publicado con esa release antes de ejecutarlas.
- Los pasos de `github/codeql-action` de un workflow se mueven como una sola
  versión: CodeQL aborta cuando no coinciden, así que Dependabot los agrupa
  (`github/codeql-action*`) y la subida llega en una única pull request.
- El `permissions:` de nivel superior es de solo lectura en todos los workflows y
  cada job pide el permiso de escritura que necesita. Un `permissions:` a nivel
  de job **sustituye** el del workflow, así que un job que usa
  `actions/checkout` debe repetir `contents: read`.

**Publicaciones.** Redacta la nota de tu cambio con `npm run changeset` y haz
commit del fichero que escribe en `.changeset/`; los cambios solo de
documentación no la necesitan, porque el manifiesto raíz es privado y no se
versiona. Al mergear la pull request `chore(release): version packages`
se publica en npm (OIDC trusted publishing, sin `NPM_TOKEN`) y se construye la
imagen de Docker. Esa PR la abre `changesets/action` con el `GITHUB_TOKEN` por
defecto, así que sus workflows llegan como **"action_required"** y hay que
aprobarlos (Actions → la ejecución → _Approve and run_) para que sus
comprobaciones signifiquen algo.

## 9. Referencias

- [Arquitectura](./02-arquitectura.md) — mapa del código.
- [Modelo de datos](./03-modelo-de-datos.md) — tablas.
- [Despliegue](./08-despliegue.md) — cómo ejecutarlo.

## 10. Estructura del repositorio

Las rutas que importan al tocar el código:

```
vite.config.ts                Configuración de build (Nitro node-server)
src/
  routes/           Rutas de TanStack Router
  lib/
    db.server.ts             SQLite (sql.js) + esquema + semilla
    business-csv.ts          Parser CSV y mapeo de columnas
    csv-text.ts              Registros y separador de un CSV (regla compartida)
    business-import.server.ts Upsert + auditoría de filas importadas
    connectors.server.ts     Conectores pull de Pipedrive / Holded
    demo-data.server.ts      Filas de ejemplo (ids demo-)
    backup-crypto.ts         Cifrado de copias con contraseña
    data.functions.ts        Server functions (puerta única de escritura)
    ee.server.ts             Auditoría, reversión y consultas de negocio
    ai/chat.server.ts        Chat con herramientas y control anti-inyección
    drive.server.ts          Cliente de Google Drive API
    drive-tokens.server.ts   OAuth de Drive y ciclo de vida de tokens
    local-fs.server.ts       Carpetas locales autorizadas (lectura + escritura aprobada)
    notion.server.ts         Cliente de la API de Notion
    notion-tokens.server.ts  OAuth de Notion y ciclo de vida de tokens
    office.server.ts         Extracción de texto/PDF/Office (Drive + local)
    engine/                  Proveedor de modelo + custodia local de credenciales
drizzle/schema.ts             Esquema SQLite tipado
drizzle/init.sql              DDL SQLite (aplicado al arrancar)
packages/openexpert/          Motor MIT (modelo, config, herramientas, CLI)
docker/                       Dockerfile y docker-compose
docs/{en,es}/                 Documentación bilingüe
scripts/                      Scripts del repositorio (docs, licencias, escritorio)
src-tauri/                    Cáscara de escritorio Tauri (solo la ventana)
install.sh                    Instalación Linux en un solo comando
.changeset/                   Notas de la próxima versión
```
