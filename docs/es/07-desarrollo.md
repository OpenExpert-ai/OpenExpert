# 07 · Desarrollo

> **Audiencia:** equipo de ingeniería. Este documento describe la puesta en marcha del entorno de desarrollo.

---

## 1. Requisitos previos

| Herramienta | Versión mínima | Notas                                   |
| ----------- | -------------- | --------------------------------------- |
| Node.js     | 20             | Se recomienda la LTS vigente            |
| npm         | 10             | Gestor de paquetes oficial del proyecto |

No se requiere Supabase CLI para el desarrollo habitual.

## 2. Puesta en marcha

```sh
npm ci                              # instala el árbol fijado en package-lock.json
cp .env.example .env                # plantilla documentada
# Completar .env con las credenciales correspondientes (ver §3)
npm run dev                         # http://localhost:3000
```

Se recomienda `npm ci` frente a `npm install`, ya que respeta el lockfile exacto.

Modo local (OpenCore, sin Supabase):

```sh
cp openexpert.json.example openexpert.json
OPENEXPERT_MODE=local npm run dev   # http://localhost:3000
node packages/opencore/bin/opencore.js doctor
```

En modo local no se requieren credenciales de Supabase. Ver [11-opencore](./11-opencore.md).

## 3. Variables de entorno

Todas las variables están documentadas con comentarios en `.env.example`.

| Variable                        | Función                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `SUPABASE_URL`                  | URL del proyecto. Obligatoria en modo cloud                      |
| `SUPABASE_PUBLISHABLE_KEY`      | Clave de navegador y servidor. Obligatoria en modo cloud         |
| `SUPABASE_SERVICE_ROLE_KEY`     | Escrituras con privilegios. Uso exclusivo en servidor            |
| `VITE_SUPABASE_URL`             | Misma URL, para el bundle del navegador                          |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Misma clave pública, para el bundle del navegador                |
| `VITE_SUPABASE_PROJECT_ID`      | Referencia del proyecto, para el bundle                          |
| `GOOGLE_API_KEY`                | Clave del modelo Gemini. Sin ella, el chat devuelve error 500    |
| `GOOGLE_CLIENT_ID`              | Acceso con Google y OAuth de Drive                               |
| `GOOGLE_CLIENT_SECRET`          | Acceso con Google y OAuth de Drive                               |
| `GOOGLE_REDIRECT_URI`           | URI de retorno fija de Drive (opcional)                          |
| `GOOGLE_OAUTH_STATE_SECRET`     | Secreto para firmar el parámetro `state` (opcional)              |
| `PUBLIC_APP_URL`                | Origen público en producción (opcional)                          |
| `DATABASE_URL`                  | Utilizada exclusivamente por `npm run db:migrate`                |
| `OPENEXPERT_MODE`               | `cloud` (por defecto) o `local`                                  |
| `OPENEXPERT_DATA_DIR`           | Directorio de datos en modo local. Por defecto, `~/.openexpert/` |
| `OPENEXPERT_MODEL_PROVIDER`     | `google` \| `ollama` \| `openai-compatible` (modo local)         |

> En desarrollo, el plugin de Vite expone el contenido completo de `.env` en `process.env` del servidor. **En producción esto no aplica**: las variables deben definirse en el proyecto de alojamiento. Ver [08-despliegue](./08-despliegue.md).

`.env` está excluido del control de versiones; `.env.example` documenta las variables sin valores.

## 4. Scripts

| Script                    | Función                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `npm run dev`             | Servidor de desarrollo en el puerto **3000** (fijo)            |
| `npm run dev:local`       | Servidor de desarrollo en modo local (`OPENEXPERT_MODE=local`) |
| `npm run opencore:doctor` | Diagnóstico del modo local                                     |
| `npm run build`           | Build de producción                                            |
| `npm run build:dev`       | Build en modo desarrollo, para depuración del bundle           |
| `npm run preview`         | Sirve el build en local                                        |
| `npm run lint`            | ESLint sobre el repositorio                                    |
| `npm run format`          | Prettier en modo escritura                                     |
| `npm run db:migrate`      | Aplica las migraciones (requiere `DATABASE_URL`)               |
| `npm run db:studio`       | Drizzle Studio para exploración de la base de datos            |

### Puerto 3000

`vite.config.ts` fija `port: 3000` y `strictPort: true`. Las URI de redirección de OAuth están registradas con `localhost:3000`; si el servidor cambiase de puerto, el acceso y la conexión de Drive fallarían.

El preset de Nitro se selecciona según el modo: `vercel` en modo cloud y `node-server` cuando `OPENEXPERT_MODE=local`.

## 5. Migraciones

El esquema se controla mediante **ficheros SQL redactados manualmente** en `drizzle/migrations/`. Drizzle actúa en este proyecto únicamente como ejecutor; `drizzle/schema.ts` permanece vacío de forma intencionada y **no se utiliza `db:generate`**.

Para añadir una migración:

1. Crear `drizzle/migrations/000N_descripcion.sql` con el siguiente número correlativo.
2. Añadir la entrada correspondiente en `drizzle/migrations/meta/_journal.json`, con `idx` correlativo y marca de tiempo en milisegundos.
3. Ejecutar `npm run db:migrate` con `DATABASE_URL` apuntando a la base de datos destino.

> **Integridad de hash.** Las migraciones aplicadas son inmutables: cualquier corrección requiere una nueva migración.

> **Email del propietario.** Las migraciones `0002`, `0006` y `0010` leen el email del propietario del ajuste de Postgres `app.owner_email` en lugar de un literal, de modo que el repositorio no contiene datos personales. Defínelo por entorno antes del primer acceso:
>
> ```sql
> ALTER DATABASE postgres SET app.owner_email = 'owner@example.com';
> ```
>
> Si ya aplicaste una revisión anterior de estas migraciones, actualiza los hash almacenados en `drizzle.__drizzle_migrations` o re-baseliniza la base de datos.

Para inspección de la base de datos sin cliente externo: `npm run db:studio`.

## 6. Convenciones de código

- **Rutas por fichero** en `src/routes/`. El enrutador es TanStack Router: cada fichero corresponde a una ruta. El layout raíz único es `__root.tsx`. `routeTree.gen.ts` es autogenerado y no debe editarse manualmente.
- **Los módulos `.server.ts` se importan exclusivamente desde el servidor.**
- **Validación con Zod en el borde.** Cada server function declara un `inputValidator`.
- **Mensajes de error de negocio en español y visibles para el usuario.**
- **Formato con Prettier** antes de cada commit.
- **Sin `any` implícito.**

## 7. Verificación previa

```sh
./node_modules/.bin/tsc --noEmit
npm run lint
npm run build
```

Todos los comandos deben finalizar sin errores.

## 8. Control de versiones

- `.env` **nunca** se versiona; está incluido en `.gitignore`. `.env.example` sí se versiona.
- `.gitignore` excluye asimismo respaldos, ficheros de descarga y datos locales (`openexpert.json`, `.openexpert/`, `credentials.json`).

## Referencias

- [Arquitectura §3-§4](./02-arquitectura.md#3-estructura-de-carpetas) — mapa del código.
- [Modelo de datos §7](./03-modelo-de-datos.md#7-migraciones) — migraciones aplicadas.
- [Despliegue](./08-despliegue.md) — paso a producción.
- [OpenCore](./11-opencore.md) — modo local y núcleo MIT (`packages/opencore/`).
