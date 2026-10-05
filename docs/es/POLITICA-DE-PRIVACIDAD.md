# OpenExpert — Política de privacidad

> **Versión canónica (inglés):** [`PRIVACY.md`](../../PRIVACY.md)
> **Espejo (inglés):** [`docs/en/PRIVACY.md`](../en/PRIVACY.md)

OpenExpert es un panel de operaciones **local-first** para un único propietario.
Funciona entero en tu equipo; tus datos se quedan ahí por defecto. Esta política
explica qué datos accede, almacena y, cuando tú lo activas expresamente, transmite.

## 1. Lo que **no** recogemos

- Ni telemetría, ni analítica, ni cookies, ni píxeles de seguimiento.
- No hay servidores de OpenExpert. No existe edición alojada.
- No hay cuentas. No hay login.

## 2. Lo que vive en tu máquina (`~/.openexpert/`)

Todos los datos siguientes se quedan en tu equipo y nunca llegan a OpenExpert
ni a un tercero a menos que tú configures una integración cloud expresamente.

| Dato                                        | Para qué                                                                                    | Vigencia                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `openexpert.db` (SQLite)                    | Tu espacio, Experts, integraciones, facturas, campañas, historial de chat, log de actividad | Hasta que la borres (`Configuración → Datos → Restaurar`)                            |
| `openexpert.json`                           | Tus preferencias no secretas (modelo, sampling, límites de chat, client_id de Google OAuth) | Editable desde la app o a mano                                                       |
| `secrets.json` (modo `0600`)                | Claves de API (Gemini, OpenAI-compatible…)                                                  | Cifrado en reposo, nunca enviado por OpenExpert                                      |
| `credentials.json` (modo `0600`)            | Tokens OAuth de Google Drive                                                                | Cifrado en reposo, usado solo para llamar a las APIs de Google con tu consentimiento |
| `state-secret` (modo `0600`)                | Clave HMAC que firma el `state` de OAuth                                                    | Generada una vez en tu máquina                                                       |
| Concesiones de Picker (`drive-grants.json`) | Lista de archivos que tú elegiste compartir con OpenExpert                                  | Hasta que las revoques (`Integraciones → Fuentes`)                                   |

## 3. El modelo de IA

OpenExpert te permite elegir el proveedor de modelo.

- **Por defecto y recomendado: Ollama.** Corre en local. **Tus prompts y el contenido de los archivos que elijas de Drive no salen de tu máquina.**
- **Opcional: Google Gemini o cualquier endpoint OpenAI-compatible.** Tú pones tu propia clave. En ese caso, **el texto de la conversación y el contenido de los archivos elegidos de Drive se envían a ese proveedor** para que responda. OpenExpert no es parte de esos intercambios.

OpenExpert **no** usa estos datos para entrenar, ajustar o mejorar un modelo. Los proveedores tienen los suyos propios
([Términos de la API de Gemini](https://ai.google.dev/terms),
[Política de uso prohibido de IA generativa de Google](https://policies.google.com/terms/generative-ai)).

## 4. Google Drive (opcional)

OpenExpert se conecta a Google Drive solo si tú lo eliges.

- **Qué pide.** OpenExpert usa el scope mínimo
  `https://www.googleapis.com/auth/drive.file`. Es un scope no sensible: da acceso **solo a los archivos que tú selecciones con Google Picker** y a los que la propia app cree en tu nombre. No puede leer ni listar el resto de tu Drive.
- **Qué hace.** Buscar, resumir, crear y editar los archivos que elegiste con el Picker o que OpenExpert creó por ti.
- **Qué no hace.** No lee, indexa ni transmite el resto de tu Drive. No usa Drive como almacenamiento de los datos de OpenExpert.
- **Aprobación humana.** Toda escritura (crear / editar / borrar) la propone el asistente y se muestra como tarjeta de aprobación.** Hasta que hagas clic en Aprobar, no cambia nada.
- **Cómo desconectar.** `Integraciones → Fuentes → Desconectar`. También revocamos el refresh token en el lado de Google.

### Reconocimiento de Limited Use

> _El uso de la información recibida de los scopes de Google Workspace cumplirá la Google User Data Policy, incluidos los requisitos de Limited Use._

En concreto:

- Los datos se usan solo para las funciones visibles en OpenExpert (chat, lista de fuentes, registro de auditoría).
- No se transfieren a plataformas publicitarias, ni se venden, ni se usan para scoring crediticio ni para entrenar modelos no personalizados.
- Nadie lee tus archivos, salvo que pidas ayuda y concedas consentimiento explícito para el archivo concreto.

### El cliente OAuth va embebido en el build

OpenExpert se distribuye con un **cliente OAuth compartido** mantenido por los mantenedores del proyecto (no por ti). Solo pide `drive.file` y una URI de redirección a localhost. Los mantenedores publican esta política y la mantienen alcanzable. Si haces un fork y redistribuyes, debes aportar tu propia política y tu propio cliente OAuth (o quitar Drive).

## 5. Copias de seguridad

Las copias (`GET /api/backup`) empaquetan la base de datos, `openexpert.json`, `secrets.json` y `credentials.json` en un único JSON en **tu máquina**. Nunca salen de ella. El servidor rechaza descargas cross-origin.

## 6. Registro de actividad y reversión

OpenExpert registra localmente cada cambio y expone una acción _Revertir_ que los restaura. Puedes borrar el historial de chat y reiniciar el espacio desde `Configuración → Datos`.

## 7. Menores

OpenExpert es una herramienta de negocio para público general. No está dirigida a menores de 13 años.

## 8. Incidentes de seguridad

Si sospechas un incidente con datos de usuario de Google, notifícalo a `security@google.com` según la
[Google Workspace User Data and Developer Policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy),
y a los mantenedores de OpenExpert por el canal de [`SECURITY.md`](../../SECURITY.md).

## 9. Cambios en esta política

Los cambios materiales se describirán en [`CHANGELOG.md`](../../CHANGELOG.md). La versión canónica es este fichero en el repositorio; los espejos pueden ir retrasados.

## 10. Licencia

OpenExpert se distribuye bajo [Licencia MIT](../../LICENSE). Esta política es informativa; no crea obligaciones contractuales más allá de las que exija tu jurisdicción.
