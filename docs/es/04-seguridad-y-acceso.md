# 04 · Seguridad y acceso

> **Audiencia:** ambos. Negocio: quién puede ver y hacer qué. Ingeniería: cómo se impide saltárselo.

---

## 1. Quién puede entrar

El acceso se concede exclusivamente mediante **inicio de sesión con Google (OAuth 2.0)**. No existen contraseñas locales ni registro abierto.

La autorización se aplica en tres capas sucesivas:

1. **Proveedor de identidad.** Únicamente el proveedor Google se encuentra habilitado. El proveedor de correo y contraseña está deshabilitado.
2. **Autorización de alta (`trigger handle_new_user`).** Verifica que el proveedor sea `google` y que el correo corresponda al administrador inicial o figure en la tabla `invitations`. Las invitaciones son de **un solo uso**: se eliminan al consumirse.
3. **Perfil de aplicación.** El acceso requiere una fila en `profiles`, creada exclusivamente por el trigger anterior. Una identidad autenticada sin perfil no obtiene acceso.

> Nota de implementación: la constante `ALLOWED_EMAIL` en el código tiene valor exclusivamente documental. La lista efectiva de acceso reside en el cuerpo del trigger, en PostgreSQL.

El primer usuario registrado adquiere el rol `ADMIN`. Los siguientes adquieren el rol indicado en su invitación.

## 2. Modelo de roles

| Rol          | Lectura de Expertos | Ejecución de acciones | Gestión de miembros |
| ------------ | ------------------- | --------------------- | ------------------- |
| `ADMIN`      | Todos               | Sí, en todos          | Sí                  |
| `INTERMEDIO` | Solo los asignados  | Sí, en los asignados  | No                  |
| `LECTOR`     | Solo los asignados  | Nunca                 | No                  |

El rol constituye un **límite máximo**, no un permiso directo. Los permisos efectivos se definen por Experto.

## 3. Permisos por Experto

Para cada par usuario–Experto existe uno de los siguientes niveles:

| Nivel  | Significado                                                      |
| ------ | ---------------------------------------------------------------- |
| `none` | El Experto no es visible.                                        |
| `read` | Permite consultar el Experto y recibir respuestas de lectura.    |
| `exec` | Incluye lo anterior y autoriza a proponer acciones de escritura. |

Reglas efectivas:

- Lectura (`canRead`): el usuario es `ADMIN`, o su nivel en el Experto es distinto de `none`.
- Ejecución (`canExec`): el usuario no es `LECTOR`, y además es `ADMIN` o su nivel en el Experto es `exec`.

Invariantes garantizados en servidor:

- Un `LECTOR` no puede ostentar nivel `exec`. El cambio de rol a `LECTOR` degrada los niveles `exec` existentes a `read`.
- Todo `ADMIN` dispone de `exec` en todos los Expertos.

### 3.1. Matriz de decisión

| Situación                              | Resultado                                      |
| -------------------------------------- | ---------------------------------------------- |
| `ADMIN` solicita cualquier operación   | Autorizado                                     |
| `INTERMEDIO` con `exec` en el Experto  | Autorizado                                     |
| `INTERMEDIO` con `read` en el Experto  | Lectura autorizada; escritura denegada         |
| `INTERMEDIO` sin permiso en el Experto | Denegado, con mensaje explicativo              |
| `LECTOR` con cualquier permiso         | Lectura si dispone de permiso; ejecución nunca |
| Sin fila en `expert_access`            | Denegado                                       |

## 4. Aislamiento entre Expertos

Ningún Experto puede consultar los datos de otro. Desde un Experto de dominio (por ejemplo, `ventas`) solo se consultan datos de dicho dominio; desde `general` se consultan los dominios para los que el usuario dispone de permiso de lectura.

Toda invocación fuera de contexto devuelve un error explícito, sin datos. Para Google Drive rige una regla adicional: el acceso se determina por la columna `sources` del Experto. Un Experto sin `gdrive` en `sources` no habilita las herramientas de Drive.

## 5. Garantías frente a uso indebido del asistente

Tres mecanismos independientes, ninguno dependiente del comportamiento del modelo:

### 5.1. Filtro previo antes de que el modelo exista

Determinados patrones (elevación de privilegios, omisión de instrucciones, extracción del prompt, modos sin restricciones) se verifican antes de remitir contenido al modelo. En caso de coincidencia, la petición se interrumpe y el intento queda registrado en `activity` con estado `denied`.

### 5.2. Verificación de permisos en servidor

Cada herramienta verifica `canRead` / `canExec` en el servidor antes de cualquier acceso. Aun ante una respuesta indebida del modelo, la escritura permanece bloqueada sin el permiso correspondiente.

### 5.3. Aprobación humana de acciones con efecto

El asistente no ejecuta acciones de negocio: únicamente las propone. Las herramientas de propuesta crean una fila en `activity` con estado `pending`, sin modificar datos. La modificación se produce exclusivamente tras la aprobación expresa en la interfaz.

Excepción: las escrituras en Google Drive (creación y edición de documentos), cuya aprobación se considera implícita en la solicitud del chat por carecer de efectos fuera de Drive. Toda escritura queda registrada en `activity`. Ver [06-integraciones](./06-integraciones.md#4-excepción-de-las-escrituras-en-drive-al-flujo-de-aprobación).

## 6. Gestión de secretos

| Secreto                     | Ámbito                  | Observaciones                            |
| --------------------------- | ----------------------- | ---------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor exclusivamente | Omite RLS. Solo en módulos `.server.ts`. |
| `SUPABASE_PUBLISHABLE_KEY`  | Navegador y servidor    | Sujeta a RLS.                            |
| `GOOGLE_CLIENT_SECRET`      | Servidor exclusivamente | Solo en el módulo de tokens de Drive.    |
| `GOOGLE_API_KEY`            | Servidor exclusivamente | Solo en la capa del asistente.           |
| `GOOGLE_OAUTH_STATE_SECRET` | Servidor exclusivamente | Firma HMAC del parámetro `state`.        |

Normas aplicables:

- Las claves de servicio se leen exclusivamente vía variables de entorno en ficheros `.server.ts`.
- `.env` está excluido del control de versiones; `.env.example` documenta las variables por nombre, sin valores.
- El parámetro `state` del flujo OAuth transporta el identificador de usuario firmado con HMAC-SHA256.

En modo local OpenCore, los secretos de Drive se conservan en `credentials.json` (permisos `0600`) dentro del directorio de datos local.

## 7. Límites conocidos del modelo

| Riesgo                           | Estado                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Miembro con `read` en un Experto | Por diseño: el aislamiento es por Experto, no por registro.                              |
| RLS                              | Concede lectura a miembros autenticados; el control por Experto reside en la aplicación. |
| Alcance de `ADMIN`               | Visibilidad total, coherente con el modelo de roles.                                     |
| Prompt del sistema               | Visible en el código fuente. No es confidencial.                                         |
| Cifrado                          | Lo proporciona la plataforma de base de datos.                                           |

## 8. Registro y reversión

### 8.1. Registro de actividad

Cada evento registra autor, tipo, Experto, resultado, resumen, fuentes y duración.

| Tipo                           | Circunstancia                                         |
| ------------------------------ | ----------------------------------------------------- |
| `Consulta`                     | Pregunta en el chat, con respuesta y fuentes          |
| `Configuración`                | Alta de Experto, activación de procesos               |
| `Cambio de rol`                | Modificación de rol, con valores anterior y posterior |
| `Permisos`                     | Modificación de permiso por Experto                   |
| `Invitación`                   | Alta de invitación                                    |
| `Integración`                  | Conexión, desconexión o sincronización                |
| `Seguridad`                    | Intento de evasión bloqueado o acceso denegado        |
| `Reversión`                    | Anulación de un cambio previo                         |
| `Ejecución de proceso`         | Solicitud de ejecución de un proceso                  |
| `Drive · creación` / `edición` | Ficheros creados o modificados desde el chat          |

### 8.2. Reversión

Toda operación reversible conserva en `snapshot.entries` las filas anteriores con su clave primaria. Únicamente son reversibles: `experts`, `expert_access`, `user_roles`, `integrations`, `processes`, `invoices`, `campaigns` e `invitations`.

Limitaciones: solo `ADMIN`; solo eventos `ok` con snapshot; la reversión no es transaccional; el evento de reversión no es reversible.

## 9. Particularidades del modo local (OpenCore)

En modo local (`OPENEXPERT_MODE=local`) existe un único propietario (`local-owner`, `ADMIN`), sin autenticación ni invitaciones. El aislamiento por Experto, el filtro previo y la aprobación humana se mantienen. La persistencia reside en ficheros locales. Ver [11-opencore](./11-opencore.md).

## Referencias

- [Modelo de datos](./03-modelo-de-datos.md) — seguridad a nivel de base de datos.
- [Inteligencia artificial](./05-inteligencia-artificial.md) — herramientas y verificaciones.
- [Integraciones](./06-integraciones.md) — seguridad de los tokens de Drive.
