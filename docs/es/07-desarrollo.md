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

En un clon nuevo, `npm ci` también construye `packages/opencore` (su script
`prepare`), así que el CLI queda listo.

## 3. Variables de entorno

Documentadas en `.env.example`. Lo esencial:

| Variable                                            | Función                                            |
| --------------------------------------------------- | -------------------------------------------------- |
| `OPENEXPERT_MODEL_PROVIDER`                         | `ollama` \| `google` \| `openai-compatible`        |
| `OPENEXPERT_MODEL_ID`                               | Identificador del modelo                           |
| `GOOGLE_API_KEY`                                    | Clave de Gemini (`google`)                         |
| `OPENEXPERT_BASE_URL` / `OPENEXPERT_MODEL_KEY`      | Endpoint `openai-compatible`                       |
| `OLLAMA_BASE_URL`                                   | Endpoint de Ollama                                 |
| `OPENEXPERT_DATA_DIR`                               | Directorio de datos (por defecto `~/.openexpert/`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`         | OAuth de Drive (opcional)                          |
| `GOOGLE_REDIRECT_URI` / `GOOGLE_OAUTH_STATE_SECRET` | OAuth de Drive (opcional)                          |
| `PUBLIC_APP_URL`                                    | Origen público para la URI de redirección de Drive |

`.env` está en `.gitignore`. El asistente del CLI guarda los secretos en
`~/.openexpert/secrets.json`, que el servidor carga en el entorno al arrancar
(las variables ya definidas tienen prioridad), de modo que `npm run dev` y
`opencore serve` se comportan igual.

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
`src/locales/en.ts` (el español es el idioma fuente).

## 4. Scripts

| Script                            | Función                                             |
| --------------------------------- | --------------------------------------------------- |
| `npm run dev`                     | Servidor de desarrollo en el puerto **3000** (fijo) |
| `npm run build`                   | Build de producción (Nitro `node-server`)           |
| `npm run preview`                 | Sirve el build                                      |
| `npm run lint` / `lint:fix`       | ESLint                                              |
| `npm run format` / `format:check` | Prettier                                            |
| `npm run typecheck`               | TypeScript sin emitir                               |
| `npm run test:run`                | Tests (app + paquete)                               |
| `npm run opencore:doctor`         | Diagnóstico del CLI                                 |
| `npm run opencore:serve`          | Arranca la app con el CLI                           |
| `npm run license:check`           | Verifica cabeceras SPDX                             |
| `npm run test:coverage`           | Tests con umbrales de cobertura                     |
| `npm run check:docs`              | Enlaces de la documentación                         |
| `npm run check:commits`           | DCO + Conventional Commits (CI)                     |

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
arrancar.

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
por un ruleset (sin escrituras directas, sin force-push, sin borrado).

| Workflow             | Se ejecuta con                                 | Qué hace                                               |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `ci.yml`             | push / PR a `main`                             | lint, formato, licencias, enlaces, tipos, tests, build |
| `codeql.yml`         | push / PR a `main`, semanal                    | análisis de CodeQL                                     |
| `scorecard.yml`      | push a `main`, semanal, manual                 | OpenSSF Scorecard                                      |
| `docker.yml`         | PRs que tocan la app o `docker/`, push, manual | construye la imagen y prueba el contenedor             |
| `pages.yml`          | cambios en `site/`, manual                     | despliega el sitio estático en GitHub Pages            |
| `release.yml`        | push a `main`, manual                          | Changesets: abre/actualiza la PR de versión o publica  |
| `server-release.yml` | una release publicada, manual                  | adjunta el paquete de servidor autónomo a la release   |

Reglas que mantienen la CI fiable:

- Cada `uses:` está fijado a un SHA de commit completo con la versión en un
  comentario final; Dependabot actualiza ambos. No sustituyas un SHA por una
  etiqueta móvil.
- Las herramientas que se descargan en tiempo de ejecución (`actionlint`,
  `gitleaks`) se bajan en una versión fija y se comprueban contra el
  `*_checksums.txt` publicado con esa release antes de ejecutarlas.
- El `permissions:` de nivel superior es de solo lectura en todos los workflows y
  cada job pide el permiso de escritura que necesita. Un `permissions:` a nivel
  de job **sustituye** el del workflow, así que un job que usa
  `actions/checkout` debe repetir `contents: read`.

**Publicaciones.** Al mergear la pull request `chore(release): version packages`
se publica en npm (OIDC trusted publishing, sin `NPM_TOKEN`) y se construye la
imagen de Docker. Esa PR la abre `changesets/action` con el `GITHUB_TOKEN` por
defecto, así que sus workflows llegan como **"action_required"** y hay que
aprobarlos (Actions → la ejecución → _Approve and run_) para que sus
comprobaciones signifiquen algo.

## 9. Referencias

- [Arquitectura](./02-arquitectura.md) — mapa del código.
- [Modelo de datos](./03-modelo-de-datos.md) — tablas.
- [Despliegue](./08-despliegue.md) — cómo ejecutarlo.
