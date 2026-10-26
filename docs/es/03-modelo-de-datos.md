# 03 · Modelo de datos

> **Audiencia:** ingeniería + negocio. La base de datos es un único fichero SQLite local.

---

## 1. Resumen

Un fichero SQLite en `OPENEXPERT_DATA_DIR/openexpert.db` (por defecto
`~/.openexpert/`). El esquema tipado es `drizzle/schema.ts`; el DDL base es
`drizzle/init.sql` y las migraciones incrementales viven en
`drizzle/migrations/` (aplicadas al arrancar por `src/lib/db.server.ts`). Las
columnas JSON se guardan como `TEXT`.

Tablas: `experts`, `integrations`, `activity`, `chat_messages`, `deals`,
`invoices`, `campaigns`, `accounts`, `settings`.

En el primer arranque `src/lib/db.server.ts` siembra la **configuración**
(Expertos, integraciones). Las tablas de negocio (`deals`, `invoices`,
`campaigns`, `accounts`) arrancan **vacías**: solo las rellena un conector real o
una importación. Las herramientas de negocio indican si hay una fuente conectada
y nunca presentan datos locales como reales. Borra el fichero de base de datos
para volver a sembrar la configuración.

## 2. Tablas

### `experts` — Expertos

| Columna       | Tipo        | Notas                                                                                                                  |
| ------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`          | TEXT PK     | Id legible (`general`, `ventas`, …)                                                                                    |
| `name`        | TEXT        | Nombre visible                                                                                                         |
| `description` | TEXT        | Se inyecta en el prompt del sistema                                                                                    |
| `sources`     | TEXT (JSON) | Conectores autorizados, p. ej. `["gdrive"]`                                                                            |
| `domains`     | TEXT (JSON) | Dominios de negocio que puede leer, p. ej. `["ventas"]`; vacío = sin datos de negocio. Añadido por la migración `0002` |
| `created_at`  | TEXT        | Fecha ISO                                                                                                              |

### `integrations` — catálogo de conectores

| Columna            | Tipo        | Notas                                                   |
| ------------------ | ----------- | ------------------------------------------------------- |
| `id`               | TEXT PK     | `gdrive`, `pipedrive`, …                                |
| `name`, `category` | TEXT        | —                                                       |
| `connected`        | INTEGER     | 0/1; hoy pueden conectarse `gdrive`, `local` y `notion` |
| `entities`         | TEXT (JSON) | `[{ name, count }]` de la última sincronización         |
| `last_sync`        | TEXT        | Fecha ISO o null                                        |

### `activity` — registro de actividad

| Columna       | Tipo        | Notas                                                        |
| ------------- | ----------- | ------------------------------------------------------------ |
| `id`          | TEXT PK     | `evt_` + 8 caracteres                                        |
| `ts`          | TEXT        | Fecha ISO                                                    |
| `actor`       | TEXT        | `human` o `agent`                                            |
| `actor_name`  | TEXT        | Nombre visible                                               |
| `type`        | TEXT        | `Configuración`, `Consulta`, `Integración`, `Seguridad`, …   |
| `expert_id`   | TEXT        | Experto afectado                                             |
| `status`      | TEXT        | `ok`, `pending`, `denied`, `failed`, `cancelled`, `reverted` |
| `summary`     | TEXT        | Descripción en una frase                                     |
| `sources`     | TEXT (JSON) | Fuentes de la información                                    |
| `duration_ms` | INTEGER     | Duración medida en ms, o null si la acción no se cronometró  |
| `snapshot`    | TEXT (JSON) | `{ entries }` (para reversión) o `{ pending }`               |

El registro no se sirve entero de una vez: `getWorkspace` trae los 300 eventos más recientes y el
total real (`activityTotal`, un `COUNT(*)`), y `getActivityPage` pagina hacia atrás con `offset`, así
que el evento más antiguo —y su snapshot, que es lo que necesita el botón de revertir— sigue siendo
alcanzable desde el panel. Antes el recorte era mudo: la pantalla imprimía el tamaño de la ventana
como si fuera el total.

### `chat_messages` — conversaciones

| Columna           | Tipo        | Notas                        |
| ----------------- | ----------- | ---------------------------- |
| `id`              | TEXT PK     | UUID                         |
| `expert_id`       | TEXT        | Experto de la conversación   |
| `conversation_id` | TEXT        | Hilo (por defecto `default`) |
| `message`         | TEXT (JSON) | Mensaje completo de UI       |
| `created_at`      | TEXT        | Fecha ISO                    |

**Retención: configurable (`chat.retentionDays`, por defecto 30 días; `0` la desactiva).**
`listConversations` elimina los hilos anteriores al corte de **todos los Expertos**, no solo los del
Experto cuya lista se abre; con `0` no borra nada.

Cada fila es un mensaje de UI completo y se identifica por el `id` que lleva dentro
(`message.id`), no por la clave de la tabla: un turno que continúa —la aprobación de una
escritura, por ejemplo— reenvía ese mensaje con la decisión y el resultado, así que se
**actualiza la fila** en vez de añadir otra copia. La respuesta a la aprobación
(`approval.approved`) y el desenlace de la herramienta viven en ese `message`, que es lo
que impide que la tarjeta vuelva a salir al recargar y que la escritura se ejecute dos
veces.

### `settings` — preferencias clave/valor

| Columna      | Tipo        | Notas                               |
| ------------ | ----------- | ----------------------------------- |
| `key`        | TEXT PK     | `ui` guarda tema, densidad e idioma |
| `value`      | TEXT (JSON) | Objeto de preferencias              |
| `updated_at` | TEXT        | Fecha ISO                           |

### Tablas de negocio

Pobladas por las integraciones correspondientes (ninguna conectada por defecto).

| Tabla       | Campos                                                                          |
| ----------- | ------------------------------------------------------------------------------- |
| `deals`     | `company`, `stage`, `value`, `owner`, `days_in_stage`, `close_date`, `status`   |
| `invoices`  | `client`, `amount`, `due_date`, `status`, `reminders`                           |
| `campaigns` | `channel`, `spend_7d`, `conversions_7d`, `cpa_target`, `daily_budget`, `status` |
| `accounts`  | `mrr`, `usage_trend`, `open_tickets`, `churn_risk`                              |

`due_date` guarda un día de calendario tal cual (`2026-09-01`), no un instante.
Los días que lleva vencida una factura se cuentan por el calendario, en la zona
horaria local (`src/lib/calendar-day.ts`): lo que una deuda lleva corriendo es
un número de días, y la hora del día no lo cambia. Una fecha que no se puede
leer, o que todavía no ha llegado, cuenta como cero días — lo que una deuda
lleva corriendo nunca es negativo ni desconocido.

## 3. Sin usuarios, roles ni RLS

La edición es de propietario único, así que no hay tablas `profiles`,
`user_roles`, `expert_access` ni `invitations`, ni seguridad a nivel de fila. Se
mantienen el registro de actividad y la reversión por su utilidad local.

## 4. Referencias

- [Arquitectura](./02-arquitectura.md) — capas.
- [Seguridad y acceso](./04-seguridad-y-acceso.md) — secretos y aislamiento.
