# 06 · Integraciones

> **Audiencia:** ambos.

---

## 1. Estado

Solo **Google Drive**, las **carpetas locales**, **Notion**, **Pipedrive**,
**Holded** y la **importación CSV** están disponibles; todas son opcionales. Los
demás conectores están modelados en los datos pero pendientes de credenciales.

| Integración          | Categoría      | Conexión       | Estado                    |
| -------------------- | -------------- | -------------- | ------------------------- |
| **Google Drive**     | Productividad  | OAuth + Picker | **Disponible**            |
| **Carpetas locales** | Productividad  | Servidor local | **Disponible**            |
| **Notion**           | Productividad  | OAuth 2.0      | **Disponible**            |
| **Pipedrive**        | CRM            | Token de API   | **Disponible (opcional)** |
| **Holded**           | ERP / Finanzas | Clave de API   | **Disponible (opcional)** |
| **Importación CSV**  | Datos          | Fichero        | **Disponible**            |
| Salesforce           | CRM            | Por licencia   | Pendiente                 |
| Gmail                | Productividad  | API            | Pendiente                 |
| Slack                | Productividad  | API            | Pendiente                 |
| Google Analytics     | Publicidad     | API            | Pendiente                 |
| Meta Ads             | Publicidad     | Token          | Pendiente                 |

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
7. La papelera de un archivo de esa lista **revoca** el acceso: su id sale de
   `drive-grants.json`, `search_drive` deja de listarlo, `read_drive_file`
   responde `(sin acceso)` y el cambio queda en el registro de actividad.
   `Desconectar` revoca todos los archivos de golpe.

Si el script del Google Picker no se puede cargar —se cayó la conexión, un bloqueador de
scripts lo paró, la CSP no lo permite— el intento se puede **reintentar**. El intento fallido no
se recuerda: el siguiente clic vuelve a pedir el script, y el mensaje que explica el fallo dice
qué comprobar. No hace falta recargar la página.

Lo mismo vale cuando `api.js` sí carga pero la librería no termina de arrancar: si el módulo
`picker` no llama al aviso de carga en **20 s**, el intento se da por fallido con el motivo
(`El cargador de Google (gapi) no respondió en 20 s…`) en vez de dejar el botón girando sin
explicación. Ese fallo tampoco se recuerda: el siguiente clic vuelve a pedir la librería.

Las lecturas tienen tope: **25 MB por archivo**. El tamaño viaja en los metadatos, así que un
archivo mayor se rechaza con una nota clara antes de descargarlo; en el texto suelto y en las
exportaciones (Docs a texto, Sheets a CSV) el tope se aplica mientras se lee, de modo que un
documento enorme nunca llega entero a la memoria del proceso. Un `.pptx` o un OpenDocument tiene
además un tope de **64 MB ya descomprimido**: un ZIP de 256 KiB puede pedir 256 MB de memoria al
inflarse, así que un documento que declare más se rechaza con una nota en vez de descomprimirse.

El tamaño del archivo y el de la respuesta son dos cosas distintas: un documento que cabe en el
tope se devuelve por **ventanas de líneas** (2000 líneas y 20.000 caracteres por lectura). Si la
respuesta trae `hasMore`, se pide el resto con `offset: nextOffset`; si además trae
`nextCharOffset`, se manda en `charOffset` con ese mismo `offset`, que es como se continúa una línea
que no cupo entera. `totalChars` dice cuánto mide el documento, así que lo que queda se sabe sin
adivinarlo.

Las ventanas encadenadas son el documento: la continuación empieza por el salto de línea que
separa su primera fila de la última de la lectura anterior, así que el texto de dos lecturas
seguidas nunca pega dos filas. `truncated` marca una sola cosa: que el corte partió una línea por
la mitad (y es lo que pide `nextCharOffset` para seguir dentro de ella). Un corte limpio entre
líneas no lo pone, aunque quede texto, porque el resto se pide igual con `hasMore`.

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

Las lecturas llegan paginadas: una búsqueda o una consulta a una base devuelve
como mucho 100 resultados por petición y un `has_more`. OpenExpert recorre hasta
cinco páginas (500 resultados) por llamada y devuelve `count`, `hasMore` y
`nextCursor`; si queda lista, el asistente sigue con ese cursor en vez de dar la
lista por completa. Una página larga se lee hasta 300 bloques por defecto y la
respuesta trae `blocks` y `hasMore`, así que un acta de 400 bloques no se entrega
a medias sin decirlo: el asistente sube `maxBlocks` (hasta 1000) y continúa.

## 4. Carpetas locales

El asistente también puede leer y escribir archivos en **carpetas del propio
equipo**, sin Google. Se eligen en **Integraciones → Fuentes → Archivos
locales**, con el navegador de carpetas integrado o escribiendo una ruta
absoluta. Las concesiones se guardan cifradas en
`~/.openexpert/local-roots.json`.

- El acceso es **solo dentro de las carpetas autorizadas**. Cada ruta se resuelve
  con `realpath` y se comprueba contra las raíces, así que se rechazan los
  enlaces simbólicos que escapen. Al crear un archivo se rechaza un nombre que
  ya exista, enlaces simbólicos incluidos (también uno roto), así que la
  escritura no sigue nunca una entrada fuera de la carpeta.
- Las lecturas devuelven texto, texto de PDFs y contenido de Office (Word
  `.docx`, Excel `.xlsx`, PowerPoint `.pptx`, OpenDocument). Un CSV o un TSV se
  entrega además como **tabla** (columnas y filas de datos, no líneas), y el
  separador se lee del propio texto —`,`, `;` (el que escribe Excel en
  castellano), tabulador o `|`—, nunca de la extensión: un fichero de una sola
  columna sigue teniendo una. Las escrituras (`create_local_file`,
  `update_local_file`) requieren **aprobación humana**, igual que las de Drive.
- Con límites: 25 MB por archivo, 200.000 caracteres devueltos, 5.000 archivos y
  profundidad 8 por listado; se omiten `.git`, `node_modules`, ficheros ocultos y
  ficheros de secretos. Los límites del listado son del recorrido, no de la carpeta:
  cuando se corta en ellos la respuesta lo dice (`truncated`), en vez de presentar el
  tope como el número de archivos que hay.
- El navegador de carpetas del panel enseña como mucho 2.000 entradas por carpeta,
  con las subcarpetas delante, y cuando hay más lo dice: «Se muestran 2.000 de
  2.120 entradas». El corte se hace **después** de ordenar, así que las
  subcarpetas —lo único que se puede pulsar para seguir navegando— no se quedan
  fuera por el orden en que el sistema devuelve el directorio.
- Docker: el servidor ve el sistema de archivos del contenedor, así que hay que
  montar la carpeta con `-v /ruta/host:/data/ruta`.

## 5. Conectores de negocio

Pipedrive, Holded y CSV son opcionales y **solo de lectura**: OpenExpert lee de
ellos y nunca escribe de vuelta. Sus claves viven en
`~/.openexpert/secrets.json` (`0600`) y no se vuelven a mostrar al guardarlas.

### Pipedrive

**Ajustes → Datos → Conectores de negocio.** Crea un token de API personal en
Pipedrive (Ajustes → Preferencias personales → API) y pégalo. La sincronización
lee las oportunidades y mapea empresa, etapa, valor, propietario, días en etapa,
fecha de cierre prevista y estado. Las filas se actualizan por `pd-<id>`.

### Holded

**Ajustes → Datos → Conectores de negocio.** Crea una clave de API en Holded
(Ajustes → Developers) y pégala. La sincronización lee las facturas y mapea
cliente, importe, vencimiento y estado (`pending`/`partial` → abierta,
`completed` → pagada, `cancelled`/`failed` → cancelada). Las filas se actualizan
por `holded-<id>`. El importe se lee con la misma regla que la importación CSV,
así que `1.234,56` entra como 1.234,56 euros; un importe que no se puede leer y
un vencimiento que no existe (`2026-02-31`) **descartan la factura** en vez de
guardarla a cero euros.

### Importación CSV

**Ajustes → Datos → Importar CSV** cubre ventas, facturas, campañas y cuentas.
Descarga la plantilla, rellénala e impórtala; acepta cabeceras en español o
inglés. La clave es `id`, o `csv-<entidad>-<fila>` si el fichero no trae id. El
límite es de 5.000 filas y una fila mala se informa por número de línea sin
tirar el resto. En las columnas de dinero —valor, importe, gasto, CPA objetivo,
presupuesto diario y MRR— una celda **vacía** vale 0, pero una celda que no es un
número (`n/d`, `1.234,56 (IVA)`) **rechaza la fila**: antes entraba como 0 euros y
la factura quedaba a cero sin que la importación avisara.

Un punto con tres decimales se lee como separador de miles (`1.234` son mil
doscientos treinta y cuatro) **salvo que la parte entera sea cero**: `0.500` es
0,50 €, no 500 €. Antes un fichero en formato inglés con tres decimales
multiplicaba el importe por mil mientras el mismo valor con coma (`0,500`) se
leía bien.

En las columnas de fecha —vencimiento y fecha de cierre— la celda tiene que
nombrar un día que exista: `31/02/2026` y `2026-02-31` son el mismo día imposible,
así que en una factura **rechazan la fila** con su número de línea y en un deal
dejan el cierre vacío. Antes se guardaban tal cual y el panel las contaba como
0 días de vencidas para siempre, porque `calendarDay` no las sabe leer. Un texto
que no es una fecha (`pendiente`, `1/3/26`) tampoco entra.

## 6. Herramientas de IA

| Herramienta                                                                                    | Comportamiento                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_drive`                                                                                 | Busca **solo** dentro de los archivos concedidos y dice cuántas coincidencias hay (`total`), aunque solo devuelva las primeras 100 (`hasMore`)    |
| `read_drive_file`                                                                              | Lee solo dentro de las concesiones; lo devuelve por ventanas de líneas (`hasMore`/`nextOffset` y, si el corte cae en una línea, `nextCharOffset`) |
| `create_drive_file`                                                                            | Crea un nuevo archivo propiedad de la app                                                                                                         |
| `update_drive_file`                                                                            | Edita un archivo concedido o creado por la app                                                                                                    |
| `list_local_files` / `search_local_files`                                                      | Lista/busca en las carpetas locales autorizadas; dice cuántos hay de verdad (`total`) y si el recorrido se cortó (`truncated`)                    |
| `search_inside_files`                                                                          | Busca texto **dentro** del contenido, sin mayúsculas ni tildes; si se para por el tope de archivos dice cuántos quedan sin revisar                |
| `read_local_file`                                                                              | Lee un archivo local; lo devuelve por ventanas de líneas (una línea larga se continúa por carácter) y describe la tabla                           |
| `create_local_file` / `update_local_file`                                                      | Escribe un archivo local, con aprobación humana                                                                                                   |
| `run_python`                                                                                   | Ejecuta un script corto de Python para **cálculos**, en un directorio temporal                                                                    |
| `search_notion` / `describe_notion_data_source` / `query_notion_database` / `read_notion_page` | Lee el contenido compartido de Notion                                                                                                             |
| `create_notion_page` / `update_notion_page` / `append_notion_blocks`                           | Escribe en Notion, con aprobación humana                                                                                                          |

Las lecturas de Drive requieren `gdrive` en `sources` del Experto; las locales
requieren `local`; las de Notion, `notion`; y ejecutar código, `python`. Todas las
escrituras requieren aprobación humana.

`run_python` no es un conector, es una capacidad: está apagada hasta que se activa por Experto. El
script corre en un directorio temporal propio, sin acceso a la red —se ejecuta dentro de un espacio
de nombres de red aislado y, si el sistema no puede crearlo, no se ejecuta— ni a las variables de
entorno de la aplicación, con un límite de tiempo y la salida recortada. Tampoco ve el resto del
disco: solo su directorio temporal y un `/usr` de lectura, porque las dos garantías las pone
`bubblewrap`. En una máquina sin él —o con los espacios de nombres desactivados— el script no se
ejecuta y el resultado dice cómo instalarlo (`apt install bubblewrap`, `dnf install bubblewrap` o
`pacman -S bubblewrap`). Solo cuenta con la biblioteca estándar de Python, y queda en el registro de
actividad con el script que se ejecutó.

Un **PDF escaneado** no tiene capa de texto: es la foto de una página. Si el ajuste
«Leer PDF escaneados con el modelo» está activado —viene **apagado**—, se transcribe con
el modelo activo, que tiene que poder ver documentos. Se hace **solo al leer un archivo a
propósito**, nunca mientras una búsqueda recorre una carpeta, y la transcripción es literal
(no un resumen), porque alimenta la búsqueda y la lectura por partes. La transcripción tiene
un tope de 200.000 caracteres: cuando un documento lo rebasa, la lectura trae `truncated` y
una nota que dice cuánto se transcribió, porque el final no se puede volver a pedir —nunca
se transcribió— y, sin ese aviso, la primera mitad pasaría por el documento entero.

### 5.1 Proveedores de modelo

Los proveedores son **datos**: `packages/openexpert/src/providers.ts` es un catálogo, y cada
ficha lleva su adaptador (`google`, `openai-compatible`, `anthropic`), su dirección, la
**variable de entorno** que guarda su clave, sus cabeceras y, si el servicio lo pide, la
**cabecera que debe llevar el id de la conversación**. El identificador de proveedor se
**deriva del catálogo**, así que añadir uno es añadir un registro, no tocar tres ficheros.

**Dos fichas no pueden compartir esa variable.** Es lo que hace independiente la clave de cada
proveedor: compartiéndola, guardar una clave pisa la de otro y el fallo no se ve hasta que ese
otro deja de autenticar. Un test lo impone. El panel, el CLI y `doctor` leen del registro la
variable de la clave, la dirección y los modelos, así que ninguno se queda con una lista de
proveedores propia.

Los modelos también son registros —nombre, coste, contexto, llamada a herramientas y
razonamiento—, y un modelo sin cifras apuntadas es uno cuyas cifras **no se han
comprobado**, no uno gratuito. La pantalla de ajustes construye su lista de opciones
recorriendo el catálogo: ninguna está escrita a mano.

**Dos proveedores están fuera a propósito.** _Copilot_, porque sus términos prestan el
servicio desde sus propias extensiones y usarlo desde otro sitio es muy probablemente una
infracción. Y el _portal de Nous_, cuyo acceso es una cuenta OAuth y no una clave de API.
El motivo vive junto al catálogo, para que nadie lo reintente sin saberlo.

## 7. Notas de seguridad

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

## 8. Referencias

- [Arquitectura](./02-arquitectura.md) — capas.
- [IA](./05-inteligencia-artificial.md) — catálogo de herramientas.
- [Seguridad y acceso](./04-seguridad-y-acceso.md) — secretos.
- [PRIVACY.md](../../PRIVACY.md) — política de privacidad.
