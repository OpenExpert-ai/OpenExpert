# 06 · Integraciones

> **Audiencia:** ambos.

---

## 1. Estado

Solo **Google Drive**, las **carpetas locales** y **Notion** están disponibles, y
todas son opcionales. Los demás conectores están modelados en los datos pero
pendientes de credenciales.

| Integración          | Categoría      | Conexión       | Estado         |
| -------------------- | -------------- | -------------- | -------------- |
| **Google Drive**     | Productividad  | OAuth + Picker | **Disponible** |
| **Carpetas locales** | Productividad  | Servidor local | **Disponible** |
| **Notion**           | Productividad  | OAuth 2.0      | **Disponible** |
| Pipedrive            | CRM            | Por licencia   | Pendiente      |
| Salesforce           | CRM            | Por licencia   | Pendiente      |
| Holded               | ERP / Finanzas | Por licencia   | Pendiente      |
| Gmail                | Productividad  | API            | Pendiente      |
| Slack                | Productividad  | API            | Pendiente      |
| Google Analytics     | Publicidad     | API            | Pendiente      |
| Meta Ads             | Publicidad     | Token          | Pendiente      |

## 2. Google Drive

Conecta tu propia cuenta de Google desde **Integraciones → Fuentes**; no
necesitas entrar en Google Cloud.

### 2.1 Flujo

1. **Integraciones → Fuentes** → `Conectar mi cuenta`.
2. Aparece un consentimiento que explica el scope, adónde va el dato y qué ve el
   modelo. Pulsa `Entiendo y conecto` para continuar.
3. Google pide `drive.file` y redirige a `http://localhost:3000/auth/google/callback`
   con `code` y un verifier PKCE.
4. El callback verifica el `state` (HMAC), canjea el código con el verifier y
   guarda los tokens cifrados en `~/.openexpert/credentials.json`.
5. **Integraciones → Fuentes** → `Seleccionar archivos` abre el Google Picker
   para que concedas acceso a archivos concretos.
6. La lista de concesiones se guarda cifrada en `~/.openexpert/drive-grants.json`.
   El chat solo puede buscar/leer/crear/editar dentro de esa lista.

### 2.2 Scopes

| Scope        | Finalidad                                                                           |
| ------------ | ----------------------------------------------------------------------------------- |
| `drive.file` | Acceso por archivo (no sensible). No requiere CASA. El usuario elige con el Picker. |

### 2.3 Privacidad

El consentimiento se muestra en la app antes de conectar. La política está en
[`PRIVACY.md`](../../PRIVACY.md) (inglés) y
[`POLITICA-DE-PRIVACIDAD.md`](./POLITICA-DE-PRIVACIDAD.md) (español).

## 3. Notion

Notion se conecta con OAuth 2.0. En **Integraciones → Fuentes → Notion**, pulsa
`Conectar Notion` y elige en el selector del propio Notion a qué páginas y bases
da acceso OpenExpert — sin configurar claves.

1. **Integraciones → Fuentes → Notion** → `Conectar Notion`.
2. Notion muestra las capacidades de la conexión y su selector de páginas; el
   usuario decide a qué páginas y bases da acceso a OpenExpert.
3. Notion redirige a `http://localhost:3000/auth/notion/callback` con un código.
4. El callback verifica el `state` (HMAC), canjea el código
   (`POST /v1/oauth/token`, HTTP Basic) y guarda el token **de larga duración**
   cifrado en `~/.openexpert/notion.json` (`0600`). Notion no usa refresh token.

Cada usuario autoriza la conexión **en su propio workspace** (`owner=user`) y
obtiene su propio token, guardado en local. No hay token compartido, así que
nadie más ve tu token ni tu contenido. La versión de la API va fijada con la
cabecera `Notion-Version` (`2026-03-11`); el límite es ~3 peticiones/segundo y se
respeta `Retry-After`.

## 4. Carpetas locales

El asistente también puede leer y escribir archivos en **carpetas del propio
equipo**, sin Google. Se eligen en **Integraciones → Fuentes → Archivos
locales**, con el navegador de carpetas integrado o escribiendo una ruta
absoluta. Las concesiones se guardan cifradas en
`~/.openexpert/local-roots.json`.

- El acceso es **solo dentro de las carpetas autorizadas**. Cada ruta se resuelve
  con `realpath` y se comprueba contra las raíces, así que se rechazan los
  enlaces simbólicos que escapen.
- Las lecturas devuelven texto, texto de PDFs y contenido de Office (Word
  `.docx`, Excel `.xlsx`, PowerPoint `.pptx`, OpenDocument). Las escrituras
  (`create_local_file`, `update_local_file`) requieren **aprobación humana**,
  igual que las de Drive.
- Con límites: 25 MB por archivo, 200.000 caracteres devueltos, 5.000 archivos y
  profundidad 8 por listado; se omiten `.git`, `node_modules`, ficheros ocultos y
  ficheros de secretos.
- Docker: el servidor ve el sistema de archivos del contenedor, así que hay que
  montar la carpeta con `-v /ruta/host:/data/ruta`.

## 5. Herramientas de IA

| Herramienta                                                                                    | Comportamiento                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `search_drive`                                                                                 | Busca **solo** dentro de los archivos concedidos |
| `read_drive_file`                                                                              | Lee solo dentro de las concesiones               |
| `create_drive_file`                                                                            | Crea un nuevo archivo propiedad de la app        |
| `update_drive_file`                                                                            | Edita un archivo concedido o creado por la app   |
| `list_local_files` / `search_local_files`                                                      | Lista/busca en las carpetas locales autorizadas  |
| `read_local_file`                                                                              | Lee un archivo local autorizado                  |
| `create_local_file` / `update_local_file`                                                      | Escribe un archivo local, con aprobación humana  |
| `search_notion` / `describe_notion_data_source` / `query_notion_database` / `read_notion_page` | Lee el contenido compartido de Notion            |
| `create_notion_page` / `update_notion_page` / `append_notion_blocks`                           | Escribe en Notion, con aprobación humana         |

Las lecturas de Drive requieren `gdrive` en `sources` del Experto; las locales
requieren `local`; las de Notion, `notion`. Todas las escrituras requieren
aprobación humana.

## 6. Notas de seguridad

- Los **tokens** y la **lista de concesiones** están cifrados con **AES-256-GCM**
  con una clave generada en tu máquina (`~/.openexpert/secret.key`, `0600`).
- El `state` de OAuth incluye el verifier PKCE firmado con HMAC; el secreto
  vive en `~/.openexpert/state-secret` (o en `GOOGLE_OAUTH_STATE_SECRET`).
- El token de Notion (larga duración) vive en `~/.openexpert/notion.json`
  (`0600`, AES-256-GCM); su `state` va firmado con
  `~/.openexpert/state-secret-notion`.
- El acceso a archivos locales queda restringido a las carpetas autorizadas (ver
  [`04-seguridad-y-acceso.md`](./04-seguridad-y-acceso.md)).
- El navegador se considera de confianza en la edición local
  monopropietario (ver [`04-seguridad-y-acceso.md`](./04-seguridad-y-acceso.md)).

## 7. Referencias

- [Arquitectura](./02-arquitectura.md) — capas.
- [IA](./05-inteligencia-artificial.md) — catálogo de herramientas.
- [Seguridad y acceso](./04-seguridad-y-acceso.md) — secretos.
- [PRIVACY.md](../../PRIVACY.md) — política de privacidad.
