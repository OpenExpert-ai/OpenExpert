# 06 · Integraciones

> **Audiencia:** ambos.

---

## 1. Estado

Solo **Google Drive** y las **carpetas locales** están disponibles, y ambas son
opcionales. Los demás conectores están modelados en los datos pero pendientes de
credenciales.

| Integración          | Categoría      | Conexión       | Estado         |
| -------------------- | -------------- | -------------- | -------------- |
| **Google Drive**     | Productividad  | OAuth + Picker | **Disponible** |
| **Carpetas locales** | Productividad  | Servidor local | **Disponible** |
| Pipedrive            | CRM            | Por licencia   | Pendiente      |
| Salesforce           | CRM            | Por licencia   | Pendiente      |
| Holded               | ERP / Finanzas | Por licencia   | Pendiente      |
| Gmail                | Productividad  | API            | Pendiente      |
| Slack                | Productividad  | API            | Pendiente      |
| Google Analytics     | Publicidad     | API            | Pendiente      |
| Meta Ads             | Publicidad     | Token          | Pendiente      |

## 2. Google Drive

El cliente OAuth va **embebido en el build** (cliente único propiedad del proyecto). **El usuario final no entra en Google Cloud.**

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

### 2.3 Claves (las pone el distribuidor, nunca el usuario)

| Variable / secret                                  | Finalidad                                                  | Dónde vive                                        |
| -------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `OPENEXPERT_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` | Client_id de OAuth (público)                               | env, `openexpert.json` o `secrets.json`           |
| `GOOGLE_CLIENT_SECRET`                             | Secret del cliente OAuth                                   | env o `secrets.json` (`0600`)                     |
| `GOOGLE_PICKER_API_KEY`                            | API key del Picker (restringir por referrer localhost)     | env o `secrets.json`                              |
| `GOOGLE_PICKER_APP_ID`                             | Número de proyecto de Cloud (público)                      | env                                               |
| `OPENEXPERT_PRIVACY_URL`                           | URL de la política de privacidad que se muestra al activar | env (por defecto, apunta a `PRIVACY.md` del repo) |

### 2.4 Pantalla de consentimiento

Publica la pantalla de consentimiento en producción para que los refresh
tokens no caduquen a los 7 días. Consulta la
[FAQ de verificación OAuth](https://support.google.com/cloud/answer/9110914).
`drive.file` es **no sensible** → no se requiere auditoría CASA.

### 2.5 Consentimiento, privacidad y Limited Use

Antes de conectar se muestra una explicación en la propia app. La frase
obligatoria de Limited Use está en [`PRIVACY.md`](../../PRIVACY.md) (inglés) y
[`POLITICA-DE-PRIVACIDAD.md`](./POLITICA-DE-PRIVACIDAD.md) (español), y un
extracto aparece en el diálogo de conectar. La URL es configurable vía
`OPENEXPERT_PRIVACY_URL`.

## 3. Carpetas locales

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

## 4. Herramientas de IA

| Herramienta                               | Comportamiento                                   |
| ----------------------------------------- | ------------------------------------------------ |
| `search_drive`                            | Busca **solo** dentro de los archivos concedidos |
| `read_drive_file`                         | Lee solo dentro de las concesiones               |
| `create_drive_file`                       | Crea un nuevo archivo propiedad de la app        |
| `update_drive_file`                       | Edita un archivo concedido o creado por la app   |
| `list_local_files` / `search_local_files` | Lista/busca en las carpetas locales autorizadas  |
| `read_local_file`                         | Lee un archivo local autorizado                  |
| `create_local_file` / `update_local_file` | Escribe un archivo local, con aprobación humana  |

Las lecturas de Drive requieren `gdrive` en `sources` del Experto; las locales
requieren `local`. Todas las escrituras requieren aprobación humana.

## 5. Notas de seguridad

- Los **tokens** y la **lista de concesiones** están cifrados con **AES-256-GCM**
  con una clave generada en tu máquina (`~/.openexpert/secret.key`, `0600`).
- El `state` de OAuth incluye el verifier PKCE firmado con HMAC; el secreto
  vive en `~/.openexpert/state-secret` (o en `GOOGLE_OAUTH_STATE_SECRET`).
- El acceso a archivos locales queda restringido a las carpetas autorizadas (ver
  [`04-seguridad-y-acceso.md`](./04-seguridad-y-acceso.md)).
- El navegador se considera de confianza en la edición local
  monopropietario (ver [`04-seguridad-y-acceso.md`](./04-seguridad-y-acceso.md)).

## 6. Añadir una integración

1. **Credenciales.** Documenta el flujo OAuth o los requisitos de plan.
2. **Tokens.** Reutiliza el patrón de Drive (fichero local cifrado, `0600`).
3. **Cliente de API.** Módulo de servidor con las credenciales del propietario.
4. **Sincronización.** Función que rellena la tabla destino y actualiza estado.
5. **Herramientas de IA.** Funciones de lectura con comprobación de dominio,
   de scope y registro de fuente. Incluye siempre un disclosure en producto si
   los datos se envían a un modelo.

## 7. Referencias

- [Arquitectura](./02-arquitectura.md) — capas.
- [IA](./05-inteligencia-artificial.md) — catálogo de herramientas.
- [Seguridad y acceso](./04-seguridad-y-acceso.md) — secretos.
- [PRIVACY.md](../../PRIVACY.md) — política de privacidad.
