# 04 · Seguridad y acceso

> **Audiencia:** ambos. Edición local de propietario único.

---

## 1. Quién puede usarlo

**No hay inicio de sesión.** OpenExpert se ejecuta en tu equipo para un único
propietario. Navegador y servidor son el mismo entorno de confianza. El servidor
escucha en el puerto 3000; por defecto acepta conexiones en todas las
interfaces, así que si lo expones más allá de `localhost`, ponlo tras un
cortafuegos o un proxy inverso.

## 2. Aislamiento entre Expertos

Ningún Experto puede leer los datos de otro. Cada herramienta de lectura
pertenece a un dominio (`ventas`, `finanzas`, `marketing`, `general`) y el
servidor comprueba que el Experto activo coincida con el dominio (o sea
`general`) antes de devolver datos. Las llamadas fuera de contexto devuelven un
error explícito, sin datos. El acceso a Google Drive se decide por la columna
`sources` del Experto, y el de archivos locales por el origen `local`,
restringido a las carpetas autorizadas.

## 3. Garantías frente a uso indebido del asistente

1. **Filtro previo.** `src/lib/ai/injection.ts` bloquea patrones de inyección
   conocidos antes de que el modelo se ejecute y registra el intento con estado
   `denied`.
2. **Comprobaciones en servidor.** El aislamiento por dominio se aplica en
   `chat.server.ts`, no por el modelo.
3. **Aprobación humana.** El asistente solo _propone_ acciones (`propose_*`,
   `request_process_run`); nada cambia hasta que apruebas la tarjeta.
4. **Endurecimiento del transporte.** Cada respuesta incluye
   `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` y
   `Permissions-Policy`, además de una `Content-Security-Policy` en producción.
   Las rutas `/api/*` (chat, copia) rechazan peticiones entre orígenes; las
   server functions quedan protegidas por el middleware CSRF de `src/start.ts`.

## 4. Gestión de secretos

| Secreto                                            | Dónde                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `GOOGLE_API_KEY`, `OPENEXPERT_MODEL_KEY`           | `.env` o `~/.openexpert/secrets.json` (`0600`)                                  |
| `GOOGLE_CLIENT_SECRET`, `GOOGLE_PICKER_API_KEY`    | env o `~/.openexpert/secrets.json` (`0600`)                                     |
| Tokens de Google Drive                             | `~/.openexpert/credentials.json` (`0600`, cifrado AES-256-GCM)                  |
| Concesiones del Picker (los archivos que elegiste) | `~/.openexpert/drive-grants.json` (`0600`, cifrado AES-256-GCM)                 |
| Carpetas locales autorizadas                       | `~/.openexpert/local-roots.json` (`0600`, cifrado AES-256-GCM)                  |
| Clave de firma del `state` OAuth                   | `GOOGLE_OAUTH_STATE_SECRET` o un `~/.openexpert/state-secret` generado (`0600`) |
| Clave de cifrado local                             | `~/.openexpert/secret.key` (`0600`, generada en el primer arranque)             |

Reglas:

- `.env`, `openexpert.json` y `~/.openexpert/` están en `.gitignore` y nunca se
  versionan.
- Los secretos se guardan en el servidor y no forman parte del flujo normal de
  datos. El panel de ajustes local puede **revelar** una clave guardada a
  petición (botón "Copiar"), así que considera el navegador como entorno de
  confianza y no expongas el puerto.
- Las copias de seguridad (`GET /api/backup`) incluyen `secrets.json` y
  `credentials.json`. Se rechazan las descargas entre orígenes; aun así,
  descarga copias solo en un equipo de confianza y guárdalas con cuidado.
- El `state` de OAuth lleva un verifier PKCE firmado con HMAC; el callback
  lo verifica en tiempo constante.
- Los tokens de Drive y la lista de concesiones del Picker están cifrados
  con AES-256-GCM, usando una clave generada y guardada en tu propio equipo
  (`~/.openexpert/secret.key`).
- Los archivos locales se leen/escriben **solo** dentro de las carpetas
  autorizadas: cada ruta se resuelve con `realpath` y se comprueba contra las
  raíces, así que se rechazan los enlaces simbólicos que escapen. Se omiten
  ficheros ocultos, `.git`, `node_modules` y ficheros de secretos.
- Los datos de Google se usan solo para funciones visibles del producto
  (chat, lista de fuentes, auditoría). No entrenamos modelos no
  personalizados. No vendemos ni cedemos los datos a terceros. Ver
  [`PRIVACY.md`](../../PRIVACY.md).
- El `state` del OAuth de Drive va firmado con HMAC y se compara en tiempo constante.

## 5. Datos en reposo

La base de datos es un fichero SQLite plano que tú controlas. El cifrado lo
aporta tu disco, no la aplicación. Haz copia copiando `OPENEXPERT_DATA_DIR`.

## 6. Registro y reversión

Cada cambio reversible guarda las filas previas en `snapshot.entries`; la
pantalla de actividad puede reproducirlas. Reversibles: `experts`,
`integrations`, `processes`, `invoices`, `campaigns`.

## 7. Referencias

- [Modelo de datos](./03-modelo-de-datos.md) — tablas.
- [IA](./05-inteligencia-artificial.md) — herramientas y límites.
- [Integraciones](./06-integraciones.md) — tokens de Drive.
