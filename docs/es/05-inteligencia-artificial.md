# 05 · Inteligencia artificial

> **Audiencia:** ambos. Herramientas, aislamiento y límites.

---

## 1. Modelo y proveedor

El modelo es configuración (ver [Proveedores de IA](./13-proveedores-ia.md)):
`ollama` (local), `google` (clave gratuita de Gemini), `anthropic` (Claude),
`openai-compatible` (BYOK) u `opencode-go`. Cada proveedor guarda **su** clave, en
su propia variable, y cambiar de proveedor no borra la del anterior. El asistente
responde siempre en español, muestra su razonamiento y transmite token a token
(hasta 50 pasos por turno).

Cada paso tiene un plazo máximo (4 minutos, o lo que fije
`OPENEXPERT_CHAT_TIMEOUT_MS`). El `fetch` de Node no trae plazo propio, así que un
proveedor que acepta la conexión y no contesta dejaba el turno transmitiendo hasta
que el usuario pulsaba Stop. El plazo cubre también las herramientas de ese paso,
por eso es mayor que la más lenta (`run_python` corre hasta 120 s), y cuando vence
el turno termina con un mensaje que lo explica en vez de pararse en silencio. El
registro de actividad anota ese turno como `failed` y nombra el plazo en el resumen
(solo un turno que contesta se anota `ok`), y el mensaje del asistente vacío no se
guarda en el historial: un turno sin respuesta no deja burbuja.

## 2. Catálogo de herramientas

El asistente no accede directamente a la base de datos; solo puede invocar estas
herramientas.

### Lectura

| Herramienta                | Contenido                                                                                  | Dominio     |
| -------------------------- | ------------------------------------------------------------------------------------------ | ----------- |
| `get_pipeline_summary`     | Valor abierto, nº de deals, win rate, previsión ponderada, deals fuera de ella, estancados | `ventas`    |
| `list_deals`               | Oportunidades abiertas, por etapa (máx. 200, con `total`)                                  | `ventas`    |
| `list_overdue_invoices`    | Facturas vencidas, importe, días, reclamaciones (máx. 200)                                 | `finanzas`  |
| `get_campaign_performance` | Gasto, conversiones, CPA real vs objetivo, estado (máx. 200)                               | `marketing` |
| `get_churn_risk`           | MRR, tendencia de uso, tickets, baja (máx. 200, con `total`)                               | `clientes`  |

Los datos de negocio **no se incluyen**: las tablas arrancan vacías. Un conector
no es la única vía: la importación de CSV de la página Datos escribe las mismas
tablas, así que la procedencia se lee de las filas (`rowProvenance`) y no del
conector. La herramienta atribuye el dato a un proveedor cuando esa integración
está conectada (`connected: true`) y, si no lo está, el `note` distingue los tres
casos: no hay ninguna fila —la base está vacía de verdad—, solo hay filas de
ejemplo (las que llevan id `demo-`, que se anuncian como tales) o hay datos
locales del usuario, importados en su equipo. El asistente nunca dice «la base
local está vacía» ni «los datos no son reales» sobre una tabla con filas del
usuario. La ventana del chat usa el mismo criterio: el aviso «sin fuentes de
negocio conectadas» solo se pinta cuando no hay ni conector ni una sola fila.

Las listas de negocio (`list_deals`, `list_overdue_invoices`,
`get_campaign_performance`, `get_churn_risk` y los deals estancados de
`get_pipeline_summary`) devuelven como mucho 200 filas y lo dicen: `total` —o
`stalledTotal` en el resumen del pipeline, donde la respuesta lleva más cifras—
es el número de filas que coinciden, la cifra que el modelo cita al usuario,
`hasMore` avisa de que la lista viene cortada y la nota dice cuántas se enseñan
de cuántas. Un CRM importado puede tener miles de filas (cada fichero de CSV y
cada sincronización aceptan hasta 5 000), y mandarlas enteras gastaba el turno en
tokens y perdía el hilo de la pregunta.

La previsión del pipeline solo pondera las etapas con una probabilidad declarada
(Cualificación 10 %, Demo 25 %, Propuesta 45 %, Negociación 70 %). Un CRM real no
usa esos cuatro nombres —el conector de Pipedrive guarda las etapas que el dueño
haya definido y el importador de CSV escribe el texto tal cual—, así que un deal
cuya etapa no está en la tabla no se pondera con una probabilidad inventada: se
queda fuera de la previsión y se cuenta en `unweighted` (cuántos deals y cuánto
valor). La nota de la herramienta lo dice para que el modelo no cite la cifra como
el pipeline entero, y la tarjeta de la interfaz lo escribe al lado de la previsión.

Los días que lleva vencida una factura se cuentan por el calendario, en la zona
horaria local: el día que vence y el día que se lee se comparan como días, así
que la hora del día nunca suma un día a la cuenta. El mismo número es el que
enseña la tarjeta de reclamación de cobro, porque los dos salen de la misma
consulta.

Una factura está vencida por su **fecha**: cuenta si el vencimiento ya pasó y no
está pagada (`paid`) ni anulada (`cancelled`), aunque el `status` guardado sea
`open`, que es lo que escriben el importador de CSV y el conector de Holded. El
`status` explícito `overdue` se sigue respetando tal cual, también con fecha
futura (sale con 0 días de retraso).

### Google Drive (opcional)

| Herramienta         | Requiere              |
| ------------------- | --------------------- |
| `search_drive`      | `gdrive` en `sources` |
| `read_drive_file`   | `gdrive` en `sources` |
| `create_drive_file` | `gdrive` en `sources` |
| `update_drive_file` | `gdrive` en `sources` |

### Archivos locales (opcional)

| Herramienta                               | Requiere                                 |
| ----------------------------------------- | ---------------------------------------- |
| `list_local_files` / `search_local_files` | `local` en `sources`                     |
| `search_inside_files`                     | `local` en `sources`                     |
| `read_local_file`                         | `local` en `sources`                     |
| `create_local_file` / `update_local_file` | `local` en `sources` + aprobación humana |

Las herramientas de lectura extraen texto de ficheros de texto, PDF, Word
(`.docx`), Excel (`.xlsx`) y PowerPoint (`.pptx`), tanto en carpetas locales como
en Google Drive.

### Capacidades (apagadas por defecto)

| Herramienta  | Función                                                     | Activar                            |
| ------------ | ----------------------------------------------------------- | ---------------------------------- |
| `run_python` | Cálculos, como script corto de Python (biblioteca estándar) | `python` en `sources`, por Experto |

El script se ejecuta en un directorio temporal privado, con el entorno limpio, un
tiempo máximo (30 s, hasta 120 s) y la salida acotada, y el propio script queda
en el registro de actividad. La red está cortada siempre: corre dentro de un
espacio de nombres de red propio y, si el sistema no puede crearlo, no se ejecuta.
El resto del disco solo queda fuera de su alcance con `bubblewrap` —un `/usr` de
lectura y el directorio de trabajo—, así que sin él tampoco se ejecuta: `unshare -Urn`
aísla la red y deja tus claves legibles, que es peor que no ejecutar nada, y el
resultado dice cómo instalarlo. El intérprete tiene que ser el del sistema, en
`/usr`, `/opt`, `/lib` o `/lib64`, porque son los directorios que monta el sandbox.

### Notion (opcional)

| Herramienta                                                                                    | Requiere                                  |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `search_notion` / `describe_notion_data_source` / `query_notion_database` / `read_notion_page` | `notion` en `sources`                     |
| `create_notion_page` / `update_notion_page` / `append_notion_blocks`                           | `notion` en `sources` + aprobación humana |

Notion se conecta con OAuth 2.0; el usuario elige qué páginas/bases comparte en
el selector de Notion.

`append_notion_blocks` respeta el tope de la API: Notion acepta como máximo 100
bloques hijos por petición y una lista más larga es un error. Así que la
herramienta trocea la lista en lotes de 100 y los manda en orden, uno detrás de
otro (el orden es el contenido, no van en paralelo). El resultado dice cuántos
bloques se añadieron (`appended`) y en cuántas peticiones (`requests`); si un
lote falla, el error dice por cuál iba y cuántos bloques quedaron escritos, para
releer la página antes de repetir y no duplicar lo que sí llegó.

### Propuestas (no ejecutan)

| Herramienta                 | Propone                                 |
| --------------------------- | --------------------------------------- |
| `propose_invoice_reminders` | Registrar reclamaciones de cobro        |
| `propose_pause_campaigns`   | Pausar campañas por encima del objetivo |

Aprobar una reclamación de cobro la apunta en la factura (sube `reminders`): no
se envía ningún correo, y el resumen que queda en `activity` lo dice así («1
reclamación de cobro registrada»), con Holded como única fuente.

Los dos crean una fila en `activity` con estado `pending`, mostrada como tarjeta de
confirmación. Nada cambia hasta que la apruebas.

### Utilidad

| Herramienta        | Función                          |
| ------------------ | -------------------------------- |
| `open_expert_form` | Formulario para crear un Experto |

## 3. Aislamiento por dominio

Cada herramienta de lectura pertenece a un dominio. Cada Experto guarda los
dominios que puede leer en `experts.domains`; el servidor comprueba el dominio
contra esa lista antes de devolver datos; si no, devuelve un error explícito
"fuera de contexto", sin datos. El acceso a Drive se decide por la columna
`sources` del Experto; el acceso a archivos locales se decide por el origen
`local` y queda además restringido a las carpetas autorizadas. Los dominios se
eligen al crear o editar un Experto; un Experto sin dominios puede chatear y usar
las fuentes, pero no lee datos de negocio.

## 4. Límites

| Límite                 | Valor                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| Pasos por turno        | 50                                                                                |
| Retención de historial | Configurable (`chat.retentionDays`), 30 días para todos los Expertos; `0` no poda |
| Coste                  | El del proveedor; Ollama es gratis                                                |

## 5. Referencias

- [Seguridad y acceso](./04-seguridad-y-acceso.md) — garantías.
- [Proveedores de IA](./13-proveedores-ia.md) — Ollama, Gemini, BYOK.
