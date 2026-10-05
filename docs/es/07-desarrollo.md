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
migraciones pendientes y siembra datos de ejemplo.

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

## 8. Referencias

- [Arquitectura](./02-arquitectura.md) — mapa del código.
- [Modelo de datos](./03-modelo-de-datos.md) — tablas.
- [Despliegue](./08-despliegue.md) — cómo ejecutarlo.
