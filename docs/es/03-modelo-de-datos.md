# 03 · Modelo de datos

> **Audiencia:** ingeniería + negocio. La base de datos es un único fichero SQLite local.

---

## 1. Resumen

Un fichero SQLite en `OPENEXPERT_DATA_DIR/openexpert.db` (por defecto
`~/.openexpert/`). El esquema tipado es `drizzle/schema.ts`; el DDL es
`drizzle/init.sql` (aplicado al arrancar por `src/lib/db.server.ts`). Las
columnas JSON se guardan como `TEXT`.

Tablas: `experts`, `processes`, `integrations`, `activity`, `chat_messages`,
`deals`, `invoices`, `campaigns`, `accounts`, `settings`.

## 2. Tablas

### `experts` — Expertos

| Columna       | Tipo        | Notas                                       |
| ------------- | ----------- | ------------------------------------------- |
| `id`          | TEXT PK     | Id legible (`general`, `ventas`, …)         |
| `name`        | TEXT        | Nombre visible                              |
| `description` | TEXT        | Se inyecta en el prompt del sistema         |
| `sources`     | TEXT (JSON) | Conectores autorizados, p. ej. `["gdrive"]` |
| `created_at`  | TEXT        | Fecha ISO                                   |

### `processes` — procesos autónomos

| Columna                          | Tipo        | Notas                          |
| -------------------------------- | ----------- | ------------------------------ |
| `id`                             | TEXT PK     | Prefijo `p-` + nombre corto    |
| `name`, `description`, `trigger` | TEXT        | `trigger` es texto descriptivo |
| `stages`, `limits`               | TEXT (JSON) | Arrays de cadenas              |
| `approval`                       | TEXT        | `Ninguna` o `Requerida`        |
| `expert_id`                      | TEXT        | Experto al que pertenece       |
| `active`                         | INTEGER     | 0/1                            |
| `runs`                           | INTEGER     | Contador de ejecuciones        |
| `last_run`                       | TEXT        | Fecha ISO o null               |

### `integrations` — catálogo de conectores

| Columna            | Tipo        | Notas                                           |
| ------------------ | ----------- | ----------------------------------------------- |
| `id`               | TEXT PK     | `gdrive`, `pipedrive`, …                        |
| `name`, `category` | TEXT        | —                                               |
| `connected`        | INTEGER     | 0/1; hoy solo `gdrive` puede conectarse         |
| `entities`         | TEXT (JSON) | `[{ name, count }]` de la última sincronización |
| `last_sync`        | TEXT        | Fecha ISO o null                                |

### `activity` — registro de actividad

| Columna       | Tipo        | Notas                                                      |
| ------------- | ----------- | ---------------------------------------------------------- |
| `id`          | TEXT PK     | `evt_` + 8 caracteres                                      |
| `ts`          | TEXT        | Fecha ISO                                                  |
| `actor`       | TEXT        | `human` o `agent`                                          |
| `actor_name`  | TEXT        | Nombre visible                                             |
| `type`        | TEXT        | `Configuración`, `Consulta`, `Integración`, `Seguridad`, … |
| `expert_id`   | TEXT        | Experto afectado                                           |
| `status`      | TEXT        | `ok`, `pending`, `denied`, `failed`, `reverted`            |
| `summary`     | TEXT        | Descripción en una frase                                   |
| `sources`     | TEXT (JSON) | Fuentes de la información                                  |
| `duration_ms` | INTEGER     | Duración                                                   |
| `snapshot`    | TEXT (JSON) | `{ entries }` (para reversión) o `{ pending }`             |

### `chat_messages` — conversaciones

| Columna           | Tipo        | Notas                        |
| ----------------- | ----------- | ---------------------------- |
| `id`              | TEXT PK     | UUID                         |
| `expert_id`       | TEXT        | Experto de la conversación   |
| `conversation_id` | TEXT        | Hilo (por defecto `default`) |
| `message`         | TEXT (JSON) | Mensaje completo de UI       |
| `created_at`      | TEXT        | Fecha ISO                    |

**Retención: configurable (`chat.retentionDays`, por defecto 30 días).**
`listConversations` elimina los hilos antiguos.

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

## 3. Sin usuarios, roles ni RLS

La edición es de propietario único, así que no hay tablas `profiles`,
`user_roles`, `expert_access` ni `invitations`, ni seguridad a nivel de fila. Se
mantienen el registro de actividad y la reversión por su utilidad local.

## 4. Referencias

- [Arquitectura](./02-arquitectura.md) — capas.
- [Seguridad y acceso](./04-seguridad-y-acceso.md) — secretos y aislamiento.
