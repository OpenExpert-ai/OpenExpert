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

Ningún Experto puede leer datos fuera de sus dominios. Cada herramienta de
lectura pertenece a un dominio (`ventas`, `finanzas`, `marketing`, `clientes`) y
el servidor comprueba que el Experto activo lo incluya antes de devolver datos.
Las llamadas fuera de contexto devuelven un error explícito, sin datos. El acceso
a Google Drive se decide por la columna `sources` del Experto, y el de archivos
locales por el origen `local`, restringido a las carpetas autorizadas; el de
Notion por el origen `notion`, restringido a las páginas compartidas en su
selector.

## 3. Garantías frente a uso indebido del asistente

1. **Filtro previo.** `src/lib/ai/injection.ts` bloquea patrones de inyección
   conocidos antes de que el modelo se ejecute y registra el intento con estado
   `denied`, con el mensaje que lo ha disparado. Revisa toda la conversación y no
   solo el último mensaje, porque el modelo recibe el historial entero y el rol de
   cada mensaje lo pone el cliente. Un turno denegado no se guarda, y al releer el
   historial se descarta cualquier mensaje que el filtro rechace: así una
   conversación no queda bloqueada por un mensaje que ya está dentro.
   **Lo que escribió el modelo no es un intento.** El catálogo nombra palabras
   que una respuesta técnica normal usa (`bypass`, `system prompt`), así que
   una respuesta del modelo que las contenga se aceptaba. La base es lo que
   sabe qué respuestas escribió el modelo: se comparan con las respuestas
   guardadas, y un `assistant` cuyo texto no está en la base sigue contando
   como intento, porque el rol lo pone el cliente.
   Los patrones extra que escribe el dueño se comprueban **midiendo lo que
   tardan** contra una entrada adversa (`src/lib/ai/redos.server.ts`), no solo
   mirando su forma: una expresión que provoca un retroceso catastrófico no
   falla, congela el proceso, y la comprobación ocurre en el hilo que sirve la
   aplicación, en el mensaje de cada turno. La medición va dentro de un contexto
   `vm`, cuyo plazo corta la expresión si no vuelve, para que medir un patrón
   malo no congele a quien lo mide. La entrada de la medición se construye con
   un carácter de cada parte que el patrón puede consumir —un `\d` se prueba con
   un dígito, un `\s` con un espacio, una `ñ` con una `ñ`—, porque una sonda de
   solo letras ASCII mide cero contra un patrón que solo se atasca con números.
2. **Comprobaciones en servidor.** El aislamiento por dominio se aplica en
   `chat.server.ts`, no por el modelo.
3. **Aprobación humana.** El asistente solo _propone_ acciones (`propose_*`);
   nada cambia hasta que apruebas la tarjeta.
4. **Código aislado.** `run_python` solo ejecuta el script si `bubblewrap` puede
   encerrarlo en un directorio temporal sin red y sin ver el resto del disco. Sin
   `bubblewrap` no se ejecuta: un espacio de nombres de red aísla la red y deja tus
   claves legibles, que es peor que no ejecutar nada (`src/lib/python.server.ts`).
5. **Endurecimiento del transporte.** Cada respuesta incluye
   `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` y
   `Permissions-Policy`, además de una `Content-Security-Policy` en producción.
   Las rutas `/api/*` (chat, copia) rechazan peticiones entre orígenes; las
   server functions quedan protegidas por el middleware CSRF de `src/start.ts`.

## 4. Gestión de secretos

| Secreto                                                                                                   | Dónde                                                                                          |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Claves de proveedor: `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `OPENEXPERT_MODEL_KEY`, `OPENCODE_GO_API_KEY` | `.env` o `~/.openexpert/secrets.json` (`0600`); una variable por proveedor, ninguna compartida |
| `GOOGLE_CLIENT_SECRET`, `GOOGLE_PICKER_API_KEY`                                                           | env o `~/.openexpert/secrets.json` (`0600`)                                                    |
| Tokens de Google Drive                                                                                    | `~/.openexpert/credentials.json` (`0600`, cifrado AES-256-GCM)                                 |
| Concesiones del Picker (los archivos que elegiste)                                                        | `~/.openexpert/drive-grants.json` (`0600`, cifrado AES-256-GCM)                                |
| Carpetas locales autorizadas                                                                              | `~/.openexpert/local-roots.json` (`0600`, cifrado AES-256-GCM)                                 |
| Token de Notion                                                                                           | `~/.openexpert/notion.json` (`0600`, cifrado AES-256-GCM)                                      |
| Clave de firma del `state` OAuth                                                                          | `GOOGLE_OAUTH_STATE_SECRET` o un `~/.openexpert/state-secret` generado (`0600`)                |
| Clave de cifrado local                                                                                    | `~/.openexpert/secret.key` (`0600`, generada en el primer arranque)                            |

Reglas:

- `.env`, `openexpert.json` y `~/.openexpert/` están en `.gitignore` y nunca se
  versionan.
- Los secretos se guardan en el servidor y no forman parte del flujo normal de
  datos. El panel de ajustes local puede **revelar** una clave guardada a
  petición (botón "Copiar"), así que considera el navegador como entorno de
  confianza y no expongas el puerto.
- Las copias descargadas desde **Ajustes → Datos** están cifradas con
  AES-256-GCM y una contraseña que eliges. La contraseña no se guarda: si la
  pierdes, pierdes la copia. El sobre plano antiguo (`GET /api/backup`) incluye
  `secrets.json`, los ficheros cifrados de credenciales y `secret.key`; sigue
  disponible para copias viejas, pero descárgalo solo en un equipo de confianza.
- Un `openexpert.json` restaurado se **valida antes de escribirse**: una copia
  es un fichero que llega de fuera, así que la configuración que trae pasa por
  el mismo esquema que usan el panel de ajustes y el editor en crudo. Una copia
  que pida más de 200 pasos por consulta (cada paso es una llamada facturable
  al proveedor), más de 3650 días de historial, más de 200000 tokens de salida
  o un patrón de inyección que puede congelar el servidor se rechaza entera, y
  el mensaje nombra el campo y el límite que rompe.
- La **lectura** de `openexpert.json` aplica los mismos límites. El fichero es
  un fichero del proyecto que la documentación dice que se puede editar a
  mano, y también puede venir de una versión que no tenía los límites, así que
  un valor por encima de ellos se recorta al límite al leerlo —tanto el
  servidor como el CLI, que comparten el mismo lector—. Nada corre con 100000
  pasos por consulta porque el fichero lo diga. La lista de patrones de
  inyección se acota a cincuenta por lo mismo: cada uno se mide antes de
  usarse, y cinco mil costaban treinta segundos de hilo bloqueado en el primer
  chat.
- Un límite recortado se **anuncia, nunca en silencio**: la pantalla de
  ajustes (Ajustes → Avanzado → Diagnóstico) lista lo que se cortó y a qué, y
  `openexpert doctor` dice lo mismo. Un fichero que dice una cosa y una
  aplicación en marcha que hace otra es algo que hay que contarle a quien lo
  tiene.
- El `state` de OAuth lleva un verifier PKCE firmado con HMAC; el callback
  lo verifica en tiempo constante.
- Los tokens de Drive y la lista de concesiones del Picker están cifrados
  con AES-256-GCM, usando una clave generada y guardada en tu propio equipo
  (`~/.openexpert/secret.key`).
- Los archivos locales se leen/escriben **solo** dentro de las carpetas
  autorizadas: cada ruta se resuelve con `realpath` y se comprueba contra las
  raíces, así que se rechazan los enlaces simbólicos que escapen. Al crear un
  archivo se rechaza además un nombre que ya exista, y un enlace simbólico
  cuenta aunque esté roto, así que la escritura no puede seguirlo fuera de la
  carpeta. Se omiten ficheros ocultos, `.git`, `node_modules` y ficheros de
  secretos.
- Los datos de Google se usan solo para funciones visibles del producto
  (chat, lista de fuentes, auditoría). No entrenamos modelos no
  personalizados. No vendemos ni cedemos los datos a terceros. Ver
  [`PRIVACY.md`](../../PRIVACY.md).

## 5. Datos en reposo

La base de datos es un fichero SQLite plano que tú controlas. El directorio de
datos se crea `0700` y la base `0600`, así que otro usuario local no puede
leerla; el cifrado en reposo lo aporta tu disco, no la aplicación. Haz copia
desde **Ajustes → Datos** (cifrada) o copiando `OPENEXPERT_DATA_DIR`.

## 6. Registro y reversión

Cada cambio reversible guarda las filas previas en `snapshot.entries`; la
pantalla de actividad puede reproducirlas. Reversibles: `experts`,
`integrations`, `invoices`, `campaigns`.

El registro solo dice lo que puede respaldar: `duration_ms` guarda el tiempo
que la acción tardó de verdad, y es **null** en las acciones que no se
cronometran (crear un Experto, guardar un ajuste, una escritura en Drive). La
pantalla muestra ahí un guion. La columna llevaba un valor por defecto de
300 ms, así que cada evento sin cronómetro se archivaba —y se mostraba— como
«0.30s», que en un registro de auditoría se lee como una medición que nadie
había hecho. La migración `0007` rehace la tabla sin el `NOT NULL` y sin ese
valor por defecto; las filas ya guardadas conservan su valor, porque una
entrada pasada no se puede dejar de medir.

## 7. Referencias

- [Modelo de datos](./03-modelo-de-datos.md) — tablas.
- [IA](./05-inteligencia-artificial.md) — herramientas y límites.
- [Integraciones](./06-integraciones.md) — tokens de Drive.
