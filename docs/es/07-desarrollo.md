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
| `npm run typecheck`               | TypeScript sin emitir                               |
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
