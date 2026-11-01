# @openexpert/openexpert

## 0.6.0

### Minor Changes

- 82b1034: Add optional business data (CSV import, Pipedrive deals, Holded invoices, demo
  rows), passphrase-encrypted backups, model tool-calling validation, stricter
  data-directory permissions and an installer that configures the model and the
  optional connectors.

### Patch Changes

- f29a910: Aprobar una escritura deja de leerse como una denegación. El bloque del chat que sustituye a la
  tarjeta de aprobación trataba `approval-responded` como un «no», y ese es el estado de **cualquier**
  respuesta: la decisión viaja en `approval.approved`. Así que en cuanto pulsabas «Aprobar este
  acceso», la tarjeta desaparecía y en su lugar salía «Escritura local denegada» (o la de Drive o
  Notion) hasta que la herramienta terminaba y llegaba su resultado: en una escritura de Drive, uno o
  más segundos diciendo lo contrario de lo que acababas de decidir, y si la escritura fallaba después,
  el usuario ya había leído que se había denegado. Ahora la respuesta aprobada repite el texto de la
  tarjeta («Aprobado. Escribiendo el archivo…», «Aprobado. Consultando Google Drive…») y solo
  `output-denied` o un `approved: false` dicen «denegado»; si el bloque no trae decisión, no dice nada
  en vez de inventarla.
- f1f5a62: La aprobación de una escritura se guarda con el mensaje. Al aprobar `create_local_file`,
  `update_drive_file` o `create_notion_page`, la decisión no se escribía en ningún sitio: el
  turno que continúa guardaba **solo** la respuesta nueva y dejaba intacta la fila del mensaje
  que llevaba la tarjeta, así que al recargar el chat la tarjeta volvía con los botones vivos y
  una segunda aprobación reenviaba la llamada al servidor, que ejecutaba la escritura otra vez
  —una página de Notion duplicada, un archivo de Drive reescrito— mientras el usuario creía
  haberlo hecho una sola vez.

  Ahora el historial se identifica por el `message.id` que viaja dentro de cada fila y el turno
  de continuación **actualiza** ese mensaje en vez de añadir otra copia: queda con la decisión
  (`approval.approved`) y con el resultado de la herramienta, que es lo que se ve al recargar.
  Además, la conversación guardada manda: si una pestaña vieja manda otra vez la aprobación de
  una llamada que ya se resolvió, al modelo le llega el resultado que se guardó, no una
  aprobación nueva, así que la herramienta no se ejecuta por segunda vez. Las conversaciones
  que ya quedaron con las dos copias se leen con la decisión puesta.

- ba90997: `POST /api/chat` responde 400 cuando el cuerpo no es JSON. `request.json()` se llamaba sin
  protección: un cuerpo cortado por la red o escrito a mano lanzaba `SyntaxError`, subía hasta el
  catch del servidor y devolvía un 500 con la página de error SSR, con una entrada `ssr.unhandled`
  en el registro por un fallo que era del cliente. Ahora un cuerpo que no es JSON (vacío incluido)
  devuelve 400 con `{"error": "JSON inválido"}` en JSON; el cuerpo válido con forma inválida sigue
  dando 400 «Petición inválida».
- 3bf273c: El turno de chat tiene un plazo por paso. `streamText` no recibía ningún plazo y el `fetch` de
  Node (undici) no trae uno propio, así que un proveedor que aceptaba la conexión y no contestaba
  dejaba la respuesta «en vivo» hasta que el usuario pulsaba Stop, sin error y sin saber por qué.
  Ahora cada paso se corta a los 4 minutos (ajustable con `OPENEXPERT_CHAT_TIMEOUT_MS`), que es más
  que lo que puede durar el tool más lento —`run_python` corre hasta 120 s— y cubre también su
  ejecución. El plazo por paso, y no solo el primer chunk: `firstChunkMs` no salta cuando el
  proveedor no llega a mandar cabeceras, que es justo este caso.

  El SDK reporta el vencimiento como un `abort`, y el navegador descarta los abortos en silencio: el
  turno se paraba sin decir nada. Se reescribe como un `error` antes de salir, así que la interfaz
  muestra «El proveedor de IA no respondió en 4 min y el turno se ha cortado». Un Stop del usuario
  sigue siendo una cancelación y no un error.

- a99878a: `POST /api/chat` contesta 400 cuando el mensaje trae un rol que el SDK no acepta. El esquema de la
  petición admitía cuatro roles —`user`, `assistant`, `system` y `data`— y los dos últimos no son
  roles que `convertToModelMessages` sepa convertir: con `system` el SDK lanza
  `AI_InvalidPromptError` (`allowSystemInMessages` está apagado) y `data` no tiene caso, así que la
  petición pasaba la validación y reventaba tres líneas más abajo, sin capturar, y el cliente recibía
  la página de error 500 con la traza del SDK en vez del 400 «Petición inválida» que el mismo endpoint
  devuelve para cualquier otro cuerpo mal formado. El esquema acepta ahora los dos roles que la
  interfaz manda de verdad (`user` y `assistant`), que son los mismos que la dependencia toma de un
  mensaje de cliente.
- 2710187: Escuchar en `0.0.0.0` deja de aceptar cualquier `Host`. La comprobación de nombre tenía una salida
  para el comodín que daba por buena toda petición cuyo `Host` terminara en el puerto de escucha, así
  que el servidor atendía nombres que nadie había declarado. Como una petición segura sin cabecera
  `Origin` —toda petición _same-origin_ que hace una página, y por tanto la forma entera del ataque de
  DNS rebinding— pasaba también la comprobación de origen, una página servida desde `evil.test:3000`
  que el DNS reenganchara a `127.0.0.1` podía pedir `GET /api/backup` y recibir la copia completa:
  `secrets.json`, las credenciales cifradas y la `secret.key` que las descifra. Ahora el comodín dice
  solo dónde escuchar, como ya decían `SECURITY.md` y la guía de despliegue: los nombres se declaran en
  `OPENEXPERT_ALLOWED_ORIGINS` y cualquier otro se responde 403, también cuando el `Host` es el de un
  nombre de la LAN. Una instalación que expusiera la app con `OPENEXPERT_HOST=0.0.0.0` y sin esa lista
  tiene que añadirla para seguir abriéndola desde otro equipo.
- 61625d2: La copia de seguridad ya restaura las integraciones. El sobre llevaba `credentials.json` sin
  `secret.key`, así que al importarlo en otro equipo los tokens volvían cifrados con una clave que no
  estaba y la aplicación los contaba como «Drive no conectado», el Picker aparecía vacío, las
  herramientas de archivos locales decían que no había ninguna carpeta autorizada y Notion salía
  desconectado, todo sin un aviso. Ahora el sobre lleva también la clave, las concesiones del Picker,
  las carpetas locales, el token de Notion y el consentimiento de Drive, y la tarjeta avisa de que el
  fichero abre los tokens. Una copia del formato anterior (versión 1) se sigue aceptando, pero al
  importarla se dice qué no traía en vez de dar la restauración por completa.
- 56a647d: La restauración de una copia valida la configuración que trae. `openexpert.json` tiene un esquema en
  el repositorio —el mismo por el que pasan el panel de ajustes y el editor en crudo, que cortan
  `chat.maxSteps` a 200 pasos, `chat.retentionDays` a 3650 días y `ai.maxOutputTokens` a 200000
  tokens— y la restauración escribía el fichero tal cual venía en el sobre. Una copia podía dejar la
  instalación con 100000 pasos por consulta (100000 llamadas facturables al proveedor en una sola
  petición), con la purga del historial desactivada de golpe y con un patrón de inyección que congela
  el servidor, y la aplicación lo cargaba todo como si el panel lo hubiera aceptado.

  La comprobación está en la puerta, no en quien genera el sobre: una copia puede venir de otro
  equipo, de una versión antigua o de ninguna parte. Ahora la configuración se valida **antes** de
  preparar nada, y una copia que la aplicación no puede usar se rechaza entera: no se cambia nada y
  el `openexpert.json` de la instalación sigue siendo el que tenía. El mensaje dice qué campo rompe
  qué límite («chat.maxSteps: va de 1 a 200 pasos por consulta»), en español y no con el «Invalid
  option» de Zod.

  De paso, la lista de patrones de inyección lleva el mismo tope que el panel (cincuenta). Medir un
  patrón es caro —se mide contra una entrada adversaria—, así que una lista con doscientos tardaba
  segundos solo en validarla; ahora se cuentan antes de medir ninguno. Y el mensaje de un proveedor
  que el catálogo no conoce dice en español cuáles existen.

- 3c648ad: Crear un archivo local deja de seguir un enlace simbólico que ya esté en la carpeta autorizada.
  `createLocalFile` comprobaba el destino con `existsSync`, que sigue el enlace: con un enlace
  **roto** la comprobación contestaba que no había nada y `writeFileSync` creaba el fichero al otro
  lado, fuera de las carpetas que el usuario concedió, mientras la ruta devuelta —y con ella la
  tarjeta de aprobación— seguía enseñando la de dentro. Ahora mira la entrada con `lstat` (un enlace
  cuenta aunque esté roto), comprueba además a dónde resuelve y escribe con `wx`, que falla en vez de
  seguir una entrada que aparezca entre la comprobación y la escritura. Un nombre libre se sigue
  creando igual, y el error explica en español por qué se rechaza.
- 7908321: `read_local_file` lee un CSV con comillas como lo lee cualquier hoja de cálculo: una celda
  entrecomillada puede llevar dentro el delimitador y saltos de línea. El recuento se hacía partiendo
  el texto por saltos de línea y la cabecera por comas, sin mirar las comillas, así que una dirección
  escrita en dos líneas contaba una fila de más (una tabla de dos clientes se anunciaba como de tres)
  y una cabecera como `"cliente, nombre",importe` devolvía tres columnas donde hay dos, inventando una
  columna que no existe. Las dos cosas viajan al modelo en `sheets`, que las repite al usuario con
  toda la confianza. Ahora el archivo se trocea en registros respetando las comillas: las comillas
  escapadas (`""`) son una comilla literal, los campos vacíos y las líneas en blanco no descuadran el
  recuento, y el nombre de cada columna llega sin las comillas que lo envuelven. Un CSV que ya se
  leía bien sigue dando el mismo número.
- 33b858d: El estado de una fila importada se guarda con el vocabulario que leen el panel y el asistente. El
  importador de CSV guardaba la celda tal cual y todos los lectores comparan contra `open`/`won`/`lost`
  en ventas, `paid`/`cancelled` en facturas y `active` en campañas, así que un fichero exportado de un
  CRM en castellano entraba sin un solo aviso y después no lo veía nadie: el pipeline contestaba 0 €
  abiertos y 0 % de win rate sobre una tabla llena, una factura «Pagada» aparecía vencida y el asistente
  proponía reclamar el cobro a un cliente que ya había pagado, y una campaña «ACTIVA» no se podía
  pausar. `parseBusinessCsv` traduce ahora la celda a su valor canónico —castellano, mayúsculas,
  tildes, «Closed Won», «enabled»— y **rechaza la fila** cuyo estado no conoce nombrando el valor y los
  aceptados, como ya hacía con un importe que no es un número. El vocabulario vive en
  `src/lib/business-status.ts` y lo comparten el importador, los conectores y los lectores.
- d09c9d6: El importador de CSV decide el separador con la regla del lector de archivos locales
  (`src/lib/csv-text.ts`, módulo puro compartido): parte los primeros registros de cada
  candidato, cuenta solo los separadores fuera de comillas y exige que la tabla más ancha se
  repita en al menos la mitad de los registros. Antes contaba las apariciones en la primera
  línea, comillas incluidas, así que un CSV separado por `;` cuya cabecera entrecomillada
  llevara tantas comas como separadores tiene la tabla se partía por comas y todas sus filas
  se rechazaban con «Falta client (cliente)».
- 6010049: El tope de filas de la importación de CSV se anuncia con su recuento. Un fichero de 5.237 filas
  importaba 5.000 y avisaba de «una fila con error» —el corte entraba en `errors`—, así que el
  usuario leía que le faltaba una fila cuando le faltaba un bloque de 237. `parseBusinessCsv`
  publica ahora `omitted` con las filas que el tope dejó sin leer (0 si caben todas), no las cuenta
  como errores, y el panel las anuncia en su propio aviso, en castellano y en inglés. El tope sigue
  siendo 5.000 filas y vive en `CSV_MAX_ROWS`.
- 4d28ded: Los días de retraso de una factura vencida ya no salen uno de más.

  El cálculo era `Math.round((Date.now() - new Date(dueDate).getTime()) / 86400000)`,
  con `dueDate` siendo el texto tal cual que guarda la tabla `invoices`
  (`2026-09-01`). `new Date` lee ese texto como **medianoche UTC**, así que el
  cociente mezclaba dos cosas distintas: el día de calendario que separa la
  factura de hoy y la hora del día. En Madrid (UTC+2 en verano) a las 14:00 el
  cociente ya pasaba de 1,5 y `round` subía a 2: una factura vencida ayer
  decía «2 días». El error duraba de media tarde a medianoche, que es justo
  cuando se mira el panel de cobros, y en días de cambio de hora la cuenta
  salía peor todavía.

  Ahora la cuenta se hace **por el calendario**: el día que vence y el día que
  se lee se comparan como días (`src/lib/calendar-day.ts`), en la zona horaria
  local, así que ni el desplazamiento horario ni un cambio de hora de verano
  suman o restan un día. La prueba nueva fija la respuesta con relojes falsos
  (`vi.setSystemTime`) en las 00:05, las 23:30 y las 15:00, y se pasa igual en
  UTC, en Madrid, en Nueva York y en Kiritimati.

  El número nunca sale negativo: una factura marcada como vencida con vencimiento
  futuro (datos sucios) daba −40 días, y ahora da 0. Lo que una deuda lleva
  corriendo no puede ser negativo, ni ser desconocido cuando la fecha no se
  puede leer.

  El arreglo llega a los tres sitios que usaban el número, porque los tres salen
  de la misma consulta: la herramienta `list_overdue_invoices`, la tarjeta de la
  reclamación de cobro («N días» del listado que se aprueba) y la respuesta del
  modelo sobre cuánto lleva vencida una factura.

- b62d283: El registro de actividad ya no inventa duraciones. La columna `duration_ms`
  guardaba 300 ms por defecto (`NOT NULL DEFAULT 300`) y `logActivity` escribía
  `duration_ms ?? 300`, así que **todas** las acciones que nadie cronometró —
  crear un Experto, guardar un ajuste, una escritura en Drive, un intento de
  inyección bloqueado — se archivaban con 300 ms y la pantalla las pintaba como
  «0.30s». En un registro de auditoría, una cifra que nadie ha medido se lee
  como una medida real, que es la misma clase de fallo que un resumen que
  afirma un envío que no ocurrió.

  Ahora un evento sin medición guarda la duración nula y la pantalla muestra un
  guion; las que sí se cronometran (la consulta al modelo, la puerta de
  inyección, la reversión, la ejecución de Python) guardan el tiempo real. Los
  números fijos que había —40 ms en el bloqueo por inyección y 320 ms en la
  reversión— se han sustituido por la medida de verdad. La migración `0007`
  rehace la tabla sin el `NOT NULL` y sin el valor por defecto; las filas ya
  guardadas conservan su valor, porque una entrada pasada no se puede dejar de
  medir.

- 373a71e: Los contadores de una integración se leen en el idioma de la interfaz. El panel de datos pintaba el
  nombre que guardó la sincronización tal cual (`settings.data.tsx`), y cada sincronizador lo escribe
  en su idioma: «Documentos», «Hojas de cálculo», «Presentaciones», «Carpetas» y «Otros archivos» desde
  Drive y las carpetas locales, «Facturas» desde Holded y «Deals» desde Pipedrive. Con la interfaz en
  inglés una conexión de Drive anunciaba «Documentos: 12 · Carpetas: 3», y en castellano la de
  Pipedrive anunciaba «Deals: 120» en una app que llama «Ventas» a esa tabla. Ahora `syncedEntityLabel`
  traduce las etiquetas conocidas —«Deals» pasa por «Ventas»— y deja tal cual lo que no lo es, porque el
  nombre de un espacio de Notion es dato del usuario.
- f9310fe: El esquema publicado acepta el fichero que escribe la propia aplicación. `openexpert.json` lleva
  `$schema` —la clave con la que el editor valida el fichero— y el panel de chat escribe
  `chat.visionPdf`, pero `openexpert.schema.json` declara `additionalProperties: false` sin nombrar
  ninguna de las dos, así que **todo** fichero con `$schema`, es decir todos los que escribe la
  aplicación, era inválido para el esquema que él mismo declaraba: el `openexpert.json.example` que
  publica el repo fallaba su propia validación y un editor o cualquier herramienta de la cadena decía
  que la configuración no valía. Ahora las dos claves están declaradas, y una puerta
  (`src/lib/config.schema.test.ts`) compara el esquema con lo que `fileConfigSchema` y
  `chatUpdateSchema` pueden escribir en cada nivel, para que el siguiente `chat.*` que se añada no se
  quede fuera otra vez.
- 9934a28: Una factura vence por su fecha y no por una etiqueta que nadie escribe. `overdueInvoices`
  —y con ella las herramientas `list_overdue_invoices` y `propose_invoice_reminders`— filtraba
  `status === "overdue"`, un valor que ningún camino de la aplicación produce: el importador de
  CSV guarda `open` cuando la fila no trae estado, el conector de Holded solo conoce `paid`,
  `cancelled` y `open`, y los datos de ejemplo usan `open`/`paid`. Con datos reales la
  herramienta contestaba una lista vacía aunque hubiera deudas con el vencimiento pasado, y la
  reclamación de cobro no se podía ni proponer.

  Ahora una factura cuenta como vencida cuando su `due_date` ya pasó —en días de calendario, como
  el resto de la cuenta— y no está pagada ni anulada, aunque su `status` sea `open`. El `status`
  explícito `overdue` se sigue respetando tal cual, también con fecha futura, que sale con 0 días
  de retraso.

- 06aaf2d: La fecha de una fila del registro de actividad ya dice de qué año es. El registro no tiene retención,
  así que la lista abarca varios años y la línea de cada evento se pintaba solo con día, mes y hora: un
  evento del 15 de junio de 2025 y uno del 15 de junio de 2026 se leían igual, «15 jun, 10:30», y al
  reconciliar un incidente o comprobar cuándo se revirtió algo la fecha visible se leía como si fuera
  de este año. Ahora el año se escribe cuando la fecha no es del año en curso —una de este año sigue
  corta, como hasta ahora— y se toma del calendario local, no del UTC. La lista de conversaciones del
  Experto tenía el mismo defecto por duplicado; las dos pasan por un único formateador
  (`formatDateTime`), así que no pueden separarse otra vez.
- 0e6e201: El guard de patrones de inyección rechaza `((a+))+`, `(?:(?:a+))+` y `(a|aa)+`. La comprobación
  anterior solo veía un grupo cuyos corchetes cerraban justo detrás de un cuantificador, así que
  esas formas —que cuestan lo mismo— se guardaban desde Ajustes → Chat o desde `openexpert.json` y
  se ejecutaban sobre cada mensaje en el hilo principal: con `((a+))+$` y una frase de 31 caracteres
  la app se quedaba cuatro minutos sin responder (medido: 251,7 s frente a 59 s de `(a+)+$`). El
  detector recorre ahora el patrón una vez y rechaza cualquier grupo repetido —dos o más veces,
  acotado o no— que lleve dentro una repetición de longitud variable o una alternación; en tiempo de
  ejecución se salta igual, así que un patrón guardado antes del arreglo tampoco puede colgar la
  app. La regla es conservadora a propósito: un grupo repetido con alternación se rechaza aunque sus
  ramas no solapen, y una alternación sin repetir se sigue admitiendo.
- 86633e3: La guardia anti-ReDoS deja de decidir por la forma del patrón y decide por su **coste**. El detector
  anterior solo rechazaba un grupo que se repite y lleva dentro otro cuantificador o una alternación, y
  esa regla dejó pasar `.*.*.*.*.*.*b`: trece caracteres, la mitad del límite de 120, que se guardaban
  desde Ajustes → Chat o desde `openexpert.json` y se ejecutaban contra cada mensaje en el hilo
  principal. Con un mensaje de 60 caracteres la app se quedaba **23 422 ms** con el hilo bloqueado
  (medido contra el módulo del repo), y con diez estrellas y 40 caracteres el turno no volvía nunca.

  Los cuantificadores **en secuencia al mismo nivel** son la misma trampa que `(a+)+`: para el motor
  hay 2ⁿ formas de repartirse el texto. Ninguna detector de formas lo ve, y por eso la tarea pedía
  explícitamente no añadir una forma más a la misma lista.

  Ahora el patrón se **mide** contra una entrada adversa (`src/lib/ai/redos.server.ts`): se prueba
  con entradas construidas para que el motor tenga que repartirlas de todas las formas posibles —las
  letras que el propio patrón usa, seguidas de un carácter que no usa, que es lo que hace fallar la
  coincidencia al final— y se rechaza el que tarda más de lo debido. El criterio no depende de la
  forma, así que una forma nueva no vuelve a abrir el agujero. La medición corre dentro de un contexto
  `vm`, cuyo plazo corta la expresión si no vuelve: medir un patrón malo no congela a quien lo mide.

  Las dos reglas se quedan, y en este orden: la de forma es instantánea y ya conoce las formas
  clásicas, y la de coste solo se paga para los patrones que la de forma no reconoce. El texto de
  Ajustes → Chat ya no promete que solo se rechacen los grupos anidados, porque con él la promesa era
  falsa.

- dda39e0: El recuento de una importación cuenta filas escritas, no apariciones de un id: un fichero que
  repite un id ya no suma dos inserciones sobre una sola fila. La segunda aparición entra como
  actualización de la fila que acaba de escribir la primera, y el total del aviso cuadra con lo que
  hay en la base. El recuento vive en un solo helper que usan las cuatro entidades, en vez de repetir
  la regla en cada rama.
- 3b32aab: Un importe con la parte entera a cero deja de multiplicarse por mil al importar.

  `parseNumber` (`src/lib/business-csv.ts`) decidía que un punto era separador de miles cuando había
  exactamente tres decimales (`dots > 1 || decimals === 3`), sin mirar la parte entera. Con la parte
  entera a cero eso no puede ser un grupo de miles —nadie escribe `0.500` para decir quinientos—, así
  que un CSV en formato inglés con tres decimales entraba multiplicado por mil: una factura de 0,50 €
  se importaba como 500 € y la herramienta de facturas vencidas la sumaba tal cual, sin aviso en la
  importación (el valor «era un número», solo que no el que decía el fichero). El mismo valor escrito
  con coma (`0,500`) sí entraba bien, porque la rama de la coma siempre es decimal.

  Ahora, con un solo punto y la parte entera a cero (o `-0`), el punto es la marca decimal:
  `parseMoney("0.500")` devuelve 0,5 y `parseMoney("-0.125")` devuelve -0,125. Los formatos que ya se
  leían bien no cambian: `1.234` sigue siendo 1234, `12.345` 12345, `1.234,56` 1234,56 y `1234.56`
  1234,56. La regla queda escrita en el comentario de `parseNumber` y en la documentación de la
  importación CSV, en español y en inglés.

- 62afb88: El filtro de inyección revisa toda la conversación, no solo el último mensaje. La puerta se aplicaba a
  `lastMessageText(messages)`, que lee el último elemento del array: el modelo recibe el array entero como
  historial, así que un `[ataque, saludo]` pasaba el filtro y el intento viajaba al modelo sin evento de
  auditoría. Lo mismo con el rol falsificado a `assistant`, que también es dato del cliente. Ahora se revisa
  cada mensaje (con tope de 32 000 caracteres por mensaje, para que un cuerpo de 200 mensajes no convierta el
  regex en coste de CPU), el bloqueo nombra el mensaje que lo ha disparado y el turno denegado no se guarda:
  antes se persistía el mensaje bloqueado, y con la puerta mirando todo el array esa conversación habría
  quedado denegada para siempre. Al releer el historial se descarta además cualquier mensaje que el filtro
  rechace, que es la salida para las filas escritas mientras la puerta solo miraba la última.
- 7223d0d: `read_drive_file` pide `size` en los metadatos y rechaza el archivo antes de descargarlo, y las
  lecturas de texto y las exportaciones de Docs/Sheets/Slides dejan de bufferizar el documento
  entero: el tope de 25 MB se aplica mientras se lee la respuesta y se cancela el resto. Antes, un
  PDF de 800 MB o un `.txt` grande elegido con el Picker se descargaban completos para recién
  después comparar el tamaño —en el caso del texto, ni siquiera había comparación—, así que el
  proceso que sirve el panel y el chat se quedaba sin memoria en vez de responder con una nota.
- d72d653: `read_drive_file` ya puede devolver un documento entero, no solo su primer tercio. La lectura
  cortaba el texto en el carácter 20.000 y avisaba con `truncated: true`, pero la herramienta solo
  aceptaba `fileId`: no había offset ni cursor, así que todo lo que venía después del corte era
  inalcanzable y el Experto respondía con lo que tenía sin poder pedir el resto. Ahora el texto sale
  por ventanas de líneas —2000 líneas y 20.000 caracteres por lectura— con el mismo cursor que
  `read_local_file`: `hasMore` y `nextOffset` para seguir, y `nextCharOffset` (que se manda en
  `charOffset`) cuando el corte cae dentro de una línea, que es el caso de un CSV de Sheets o de un
  JSON de una sola línea. `totalChars` dice cuánto mide el documento, y un `offset` más allá del final
  devuelve una nota con el total en vez de un contenido vacío que se lee como un archivo vacío. Un
  documento de 35.000 caracteres se lee entero en dos llamadas, sin repetir ni saltarse texto. La
  ventana es una sola función, `takeWindow` en `text-window.ts`, compartida por los dos lectores.
- 37aed4f: `read_local_file` ya puede devolver el resto de una línea más larga que el tope de una lectura. La
  ventana se cortaba por líneas y después por caracteres, y los dos cortes no se hablaban: en un
  archivo de una sola línea de 300.000 caracteres —el JSON de una exportación, un `.js` o un `.css`
  minificado, un `.svg`, un CSV con retornos de carro antiguos— la lectura devolvía 200.000
  caracteres con `truncated: true`, `totalLines: 1` y ni `hasMore` ni `nextOffset`, así que los
  100.000 que faltaban no se podían pedir con ninguna llamada posterior. Ahora la respuesta trae
  también `nextCharOffset`, el carácter de esa línea donde empieza el siguiente trozo, y la lectura
  continúa desde ahí con `charOffset`: lo leído en dos llamadas reconstruye el archivo entero, sin
  huecos ni repetidos. El corte por caracteres dentro de un archivo de varias líneas se arregla con
  el mismo cursor, que antes saltaba a la línea siguiente y dejaba el resto de la larga sin leer. Y un
  `offset` mayor que el número de líneas devuelve ahora una nota con el total y el rango válido, en
  vez de un contenido vacío que se leía como un archivo vacío.
- 908df04: Las dos listas de negocio del chat dicen cuántas filas hay en vez de mandar la tabla entera:
  `list_deals` y `list_overdue_invoices` devuelven como mucho 200 filas, con `total` (las que
  coinciden, la cifra que el modelo cita), `hasMore` y una nota que dice cuántas se enseñan de cuántas.
  El importador de CSV y los conectores llenan estas tablas con hasta 5 000 filas, así que la lista
  entera gastaba el turno en tokens, el modelo perdía el hilo de la pregunta y, si el proveedor cortaba
  por longitud, el usuario leía un error en lugar de la lista.
- 2167ddb: Las tres listas de negocio que faltaban dicen cuántas filas hay en vez de mandar la tabla entera:
  `get_campaign_performance`, `get_churn_risk` y los deals estancados de `get_pipeline_summary`
  devuelven como mucho 200 filas, con `total` (las que coinciden, la cifra que el modelo cita),
  `hasMore` y una nota que dice cuántas se enseñan de cuántas; los estancados viajan con
  `stalledTotal`, porque el resumen del pipeline ya lleva otras cifras. El importador de CSV y los
  conectores llenan estas tablas con hasta 5 000 filas, así que la lista entera gastaba el turno en
  tokens y, si el proveedor cortaba por longitud, el usuario leía un error en lugar de la lista.
- 938c5b4: Añadir bloques a una página de Notion trocea la lista en lotes de 100. La API de Notion solo admite
  100 bloques hijos por petición y responde 400 a una lista más larga, así que una página que el
  modelo escribía de una vez —una lista de 150 viñetas— no se escribía y el turno se quedaba a medias
  con un «Notion respondió 400» que no decía nada. Ahora `append_notion_blocks` manda los bloques en
  lotes de 100, en orden y uno detrás de otro, y el resultado dice cuántos se añadieron (`appended`) y
  en cuántas peticiones (`requests`). Si un lote falla, el error dice por cuál iba y cuántos bloques
  quedaron escritos, para releer la página antes de repetir sin duplicar lo que sí llegó. La
  descripción de la herramienta avisa del tope, así que el modelo ya sabe que puede mandar la lista
  entera sin partirla él.
- 1247121: `search_notion` y `query_notion_database` ya no entregan una lista corta como si fuera la lista
  entera. La API de Notion devuelve como mucho 100 resultados por petición con un `has_more` y un
  `next_cursor`, y el cliente pedía una sola página (`page_size: 25` en la búsqueda, 100 en la
  consulta) sin mirar ninguno de los dos: en una base de 400 filas el asistente leía 100, las
  trataba como todas y daba un total corto sin advertirlo; en un espacio con muchas páginas decía
  que la que el usuario nombraba no existía. Ahora las dos lecturas recorren hasta cinco páginas
  (500 resultados) por llamada, se detienen ahí a propósito y devuelven `count`, `hasMore` y
  `nextCursor`; con un `cursor` se sigue exactamente donde se quedó la anterior, sin repetir la
  consulta entera. Lo mismo valía para las páginas: `read_notion_page` cortaba a 300 bloques sin
  nota, así que un acta de 400 llegaba a medias y el modelo la resumía como completa. La respuesta
  trae ahora `blocks` y `hasMore`, y `maxBlocks` (hasta 1000) permite leer más en la siguiente
  llamada. Las descripciones de las herramientas y las instrucciones del chat dicen cómo continuar,
  y las pruebas nuevas fijan los dos casos con la red simulada: dos páginas encadenadas y tope
  alcanzado con nota.
- 9417cef: El texto de un `.odt`, un `.ods` o un `.odp` conserva los espacios, los tabuladores y los saltos de
  línea, así que las palabras ya no salen pegadas.

  Un OpenDocument no escribe el espacio en blanco como carácter: dos espacios seguidos, una sangría
  hecha con espacios o un tabulador se escriben como elementos vacíos —`<text:s text:c="3"/>`,
  `<text:tab/>` y `<text:line-break/>`, que es lo que hace cualquier procesador de textos para que el
  espacio no sea ambiguo—, y son los únicos elementos cuyo contenido es la propia etiqueta. El lector
  descartaba todo lo que caía entre `<` y `>`, así que `Hola<text:s text:c="3"/>mundo` llegaba como
  «Holamundo», `Columna A<text:tab/>Columna B` como «Columna AColumna B» y
  `Primera<text:line-break/>Segunda` como «PrimeraSegunda», sin ningún error ni nota. El modelo
  recibía palabras que el documento no tiene y las citaba y resumía con toda la confianza.

  Ahora `text:s` produce tantos espacios como diga su atributo `text:c` (uno cuando falta), `text:tab`
  un tabulador y `text:line-break` un salto de línea. El recuento de `text:s` está acotado a 1000
  espacios por elemento: es un número que pone el documento y nada lo limita, y un elemento de treinta
  bytes pidiendo mil millones convertiría el tope de 64 MB del archivo en una cadena que no cabe en
  memoria. La prueba monta los tres casos y los compara carácter a carácter, y el texto de los
  documentos que ya se leían bien no cambia.

- 949b141: El texto de un `.odt` llega en el orden del documento, no con todos los títulos al final. `odfText`
  recorría `content.xml` dos veces y concatenaba —primero todos los `text:p` y después todos los
  `text:h`—, así que un documento con «Capítulo 1 / párrafo / Capítulo 2 / párrafo» se leía como
  «párrafo / párrafo / Capítulo 1 / Capítulo 2»: el modelo resumía el cuerpo sin saber a qué apartado
  pertenecía cada párrafo y contestaba con la sección equivocada, sin ningún error a la vista. Ahora
  un solo recorrido se queda con `text:p` y `text:h` en el orden en que aparecen, que es el mismo que
  necesitan las celdas de un `.ods` y los cuadros de texto de un `.odp`.
- 58332ea: Leer un `.pptx` o un OpenDocument ya no puede agotar la memoria del proceso. El lector llamaba a
  `unzipSync` sin filtro, así que descomprimía el archivador entero —imágenes y medios del mazo
  incluidos— y lo devolvía en memoria antes de mirar qué se usaba: el tamaño en disco no dice nada del
  que va a ocupar, porque deflate sobre datos repetidos amplifica 1000x. Medido: un `.odt` de 262.080
  bytes con 256 MB de ceros dentro de `content.xml` tardaba 2.072 ms y subía el RSS 549 MB; en un equipo
  de 8 GB eso se lleva por delante el proceso que está sirviendo el chat. Ahora hay un tope explícito de
  64 MB descomprimidos que se comprueba contra el `originalSize` del directorio central **antes** de
  inflar, y solo se descomprimen las entradas que se leen (`ppt/slides/*.xml` y `content.xml`). El mismo
  fichero tarda 15 ms, sube 32 MB y responde `text: null` con una nota que lo explica, en vez de
  «El documento no contiene texto extraíble», que hacía pasar una bomba por un documento vacío. Los
  `.docx` y `.xlsx` quedan fuera de esta puerta: mammoth y exceljs descomprimen el archivo entero por
  dentro y no aceptan un filtro.
- 50f4975: `OPENEXPERT_ALLOWED_ORIGINS` (nombres separados por comas) añade los que el servidor atiende
  además del bucle local y de la interfaz de escucha. Con `OPENEXPERT_HOST=0.0.0.0` — lo que
  recomienda la documentación para publicar la app — el servidor aceptaba cualquier `Host` en el
  puerto pero seguía comparando el `Origin` contra una lista en la que el comodín no añade nada: el
  `POST /api/chat` respondía 403 desde otra máquina y el chat no funcionaba en el modo que
  documentábamos. Un proxy inverso delante se topaba con lo mismo, porque el `Host` que reenvía es
  su dominio público y tampoco estaba en la lista. Los nombres siguen saliendo de la configuración
  y nunca del `Host` de la petición, así que el DNS rebinding se queda fuera; sin la variable todo
  se comporta como antes.
- 3b430de: El selector de carpetas deja de cortar sin decirlo, y ya no se come las subcarpetas. `browseDirectory`
  paraba a las 2 000 entradas **antes** de ordenar: en una carpeta real de trabajo (Descargas, una
  sincronizada) el orden del `readdir` —que no pone las carpetas primero— podía llenar la lista con
  2 000 ficheros y dejar fuera las 20 subcarpetas, que son lo único que se puede pulsar para seguir
  navegando. El usuario no podía llegar a lo que no salía y el diálogo no daba ninguna pista de que la
  carpeta tuviera más; además dos peticiones iguales podían devolver conjuntos distintos.

  Ahora se ordena primero (carpetas delante, luego por nombre) y el corte se hace al final, así que la
  lista es estable y las subcarpetas entran siempre. La respuesta dice lo que falta con `total` (las
  entradas que hay de verdad) y `truncated`, y el diálogo de **Integraciones → Fuentes → Archivos
  locales** lo escribe cuando la carpeta no cabe: «Se muestran 2.000 de 2.120 entradas», en castellano
  y en inglés.

- 8e13099: El Picker de Drive deja de girar para siempre cuando la librería de Google no arranca.

  `pickDriveFiles` resolvía la carga con `window.gapi.load("picker", () => resolve())` y no había
  plazo: si `api.js` cargaba pero el módulo `picker` no arrancaba —un bloqueador que deja pasar la
  primera petición y corta la siguiente, una CSP que permite `apis.google.com` pero no lo que ese
  script pide después, una red que se corta entre las dos—, el callback no llegaba nunca y la promesa
  quedaba pendiente para siempre. El botón «Seleccionar archivos» se quedaba girando sin mensaje y
  sin poder reintentar sin recargar la página.

  Ahora el arranque de la librería tiene un plazo de 20 s, el mismo tono que `fetchWithTimeout` en el
  servidor: pasado ese tiempo la carga se rechaza con «El cargador de Google (gapi) no respondió en
  20 s…», el `finally` del llamador baja el estado de carga y el aviso dice qué comprobar. El fallo no
  se cachea: el siguiente clic vuelve a pedir la librería.

- 333679b: El Google Picker se puede volver a intentar. Si el script `api.js` de Google no cargaba —la
  conexión se cayó, un bloqueador de scripts lo paró, la CSP no lo permitía—, todos los clics
  siguientes en «Seleccionar archivos» fallaban al instante con el mismo error, sin volver a pedir
  el script: el usuario arreglaba la causa, volvía a pulsar y seguía fallando hasta recargar la
  página entera. Y el mensaje que veía le decía que comprobara la conexión, que era justo lo que
  acababa de hacer.

  La promesa rechazada ya no se queda cacheada para siempre, y el `<script>` muerto sale de la
  página cuando falla, para que el reintento monte uno nuevo en vez de esperar a uno que no va a
  cargar nunca. Es el mismo patrón que ya usa la base de datos (`src/lib/db.server.ts`): una
  rechazo cacheado sobrevive a la causa que lo produjo, y lo único que arregla es recargar la
  página.

- 89922ce: «Probar conexión» y «Listar» ya no prueban la configuración guardada, sino la
  que está escrita en el formulario.

  El panel guarda el proveedor, el endpoint y la clave en su propio estado y
  solo los escribe cuando se pulsa «Guardar cambios», así que los dos botones
  preguntaban siempre por lo que había en disco: se elegía otro proveedor, se
  escribía su clave y el aviso era del anterior. Con una clave equivocada
  recién escrita, «Probar conexión» podía responder «Conexión correcta» porque
  la clave vieja seguía guardada.

  Ahora los dos botones viajan con lo que hay escrito: el proveedor elegido, su
  endpoint y su clave. La clave se usa para la pregunta y se tira —probar no
  guarda, y ni `secrets.json` ni `openexpert.json` se tocan— y la llamada
  recibe una **copia** del entorno con esa clave, así que el proceso sigue con
  la guardada. Sin argumentos, las funciones de servidor siguen preguntando por
  la configuración guardada, que es lo que hace el CLI.

  El aviso dice de qué se trata: «Preguntado por la configuración guardada» o
  «Preguntado por lo que has escrito, sin guardar».

- b959f72: Aprobar una reclamación de cobro ya no dice que se envió ningún correo. El registro de actividad
  la resumía como «Enviadas 1 reclamaciones de cobro (Acme)» con fuentes Holded y Gmail, cuando la
  acción solo sube el contador `reminders` de cada factura: en el repositorio no hay ningún cliente
  de correo y Gmail es una integración sembrada como desconectada. La tarjeta tampoco lo arreglaba
  —proponía «Enviar 1 reclamaciones de cobro» con el tipo «Envío de correo»—, así que lo que el
  usuario aprobaba y lo que quedaba escrito contaban una comunicación que no había ocurrido.

  Ahora el resumen dice lo que pasa («1 reclamación de cobro registrada (Acme)», «2 reclamaciones de
  cobro registradas») y Holded es la única fuente; «Enviadas» queda reservado para el día que exista
  un envío real que devuelva `ok`. La tarjeta propone «Registrar N reclamaciones de cobro» con el
  tipo `Cobro`, y las descripciones de las herramientas dejan de hablar de recordatorios enviados.
  De paso, los textos de las dos acciones concuerdan en número («1 campaña pausada», «1 reclamación»)
  en vez de decir «1 reclamaciones». Una prueba con `fetch` instrumentado fija el contrato sin red:
  `executePending` no sale a la red, no declara fuentes que no usó y su resumen no afirma un envío.

- 326de75: `search_drive` dice cuántas coincidencias deja fuera. La herramienta filtraba los archivos concedidos
  con el Picker y hacía `.slice(0, 100)` sin recuento, así que el modelo recibía 100 entradas, las daba
  por la lista completa y contestaba que el archivo 101 no existía. Ahora la respuesta lleva `total`
  con todas las coincidencias y, cuando la página es más corta que ellas, `hasMore: true` y una nota
  («Se listan 100 de 150 coincidencias. Acota la búsqueda con un nombre más preciso»), igual que
  `list_local_files` y `search_local_files`; la descripción de la herramienta y el prompt del sistema
  lo dicen para que el modelo acote en vez de dar el corte por el total.
- fb8bcfe: El Registro de Actividad deja de presentar sus 300 eventos más recientes como el registro entero. La
  lectura del espacio de trabajo cortaba la lista en 300 filas sin decirlo y la pantalla imprimía ese
  tamaño como total, así que un registro de 305 eventos se anunciaba «completo» con la etiqueta «40 /
  300 eventos» y los cinco más antiguos no se podían ver de ninguna manera — ni sus snapshots, que son
  justo lo que necesita el botón de revertir: un evento fuera de la ventana ya no se podía deshacer
  desde el panel aunque siguiera en la base. Ahora el total sale de un `COUNT(*)` real
  (`activityTotal`) y la nueva `getActivityPage` pagina hacia atrás con `offset`, con el `id` como
  desempate del orden para que dos eventos escritos en el mismo milisegundo no se repitan ni se
  pierdan al cambiar de página. La cabecera dice «{cuántos} de {total} eventos» y, mientras queden
  anteriores, una línea avisa de cuántos se están listando y de que los demás se cargan con «Cargar
  más», que ahora pide la página siguiente al servidor en vez de mover el corte dentro del mismo
  array de 300.
- 8252a71: La puerta de inyección ya no se come las respuestas del propio asistente. El catálogo nombra
  palabras que una respuesta técnica normal usa (`bypass`, `system prompt`, `ignora ... instrucciones`),
  y la puerta revisaba **toda** la conversación, incluidos los mensajes del asistente: una respuesta
  del modelo que contuviera una de esas palabras **denegaba todos los turnos siguientes** de esa
  conversación, sin que el usuario hubiera hecho nada malo. Y como la respuesta ya está guardada en
  `chat_messages`, el bloqueo era permanente: recargar el historial devolvía la misma respuesta y el
  siguiente turno volvía a denegarse. Al releer el historial, además, la respuesta desaparecía de lo
  que ve el usuario y de lo que ve el modelo, pero seguía en la base.

  Ahora lo que escribió el modelo no es un intento. **La base es lo que sabe qué respuestas escribió
  el modelo**: se comparan con las respuestas guardadas, y solo se libran cuando el texto coincide
  con el de una respuesta guardada. Un `assistant` falsificado por el cliente —que es lo que puede
  mandar un cliente, porque el rol lo pone él— sigue contando como intento y se sigue bloqueando,
  igual que el ataque en un turno anterior: la puerta no se relaja, deja de mirar lo que escribió
  OpenExpert.

- ea37b77: La restauración de una copia es todo o nada. El comentario de la función lo prometía desde hacía
  versiones, pero los ficheros se renombraban de uno en uno y el `catch` solo devolvía la base de
  datos: si el último fallaba —un `credentials.json` que no se puede reemplazar, por ejemplo—, la
  instalación se quedaba con la base de ayer y el `openexpert.json` y el `secrets.json` de la copia, y
  el aviso hablaba únicamente de la base, así que nada hacía sospechar del resto.

  Ahora el contenido de cada fichero que se va a sustituir se guarda antes (`<fichero>.pre-restore`, y
  `openexpert.db.bak` para la base, que es el que el panel anuncia), la base se aplica la última —solo
  cuando todo lo demás ya está en su sitio— y, si un rename falla, lo ya aplicado vuelve a su contenido
  anterior en orden inverso. El error dice qué se ha deshecho y qué no, nombrando el fichero que falla,
  en vez de dar a entender que todo se ha restaurado.

- 851fc81: Con la retención de chat a `0` ya no se borra nada. La pantalla de Ajustes → Chat promete que `0`
  desactiva la purga automática, pero `listConversations` calculaba el corte en el instante actual y
  eliminaba todos los hilos del Experto —de la base y sin confirmación— en cuanto se abría el chat o
  el listado. Ahora el cero se salta la poda y solo un valor mayor que cero recorta lo anterior al
  corte; el valor por defecto (30 días) se comporta igual que antes.
- aed7d7d: La retención del historial se aplica a toda la instalación. `chat.retentionDays` es un solo número
  para la instalación y el panel lo anuncia como la retención del historial, pero `listConversations`
  filtraba por Experto y podaba solo las conversaciones caducadas del Experto cuya lista se abría: el
  historial de cualquiera que no se visitara se quedaba en `chat_messages` para siempre, y no hay otro
  sitio que pode. Ahora, al abrir la lista de cualquier Experto se revisa la tabla entera y se borran
  todos los hilos fuera del plazo, sean del Experto que se abre o no; la lista devuelta sigue siendo la
  del Experto pedido, en el mismo orden. `0` sigue desactivando la purga.
- 76ac4a3: Quitar un archivo de Google Drive en Ajustes → Fuentes revoca el acceso de verdad. La papelera
  mandaba a `setGrantedFiles` la lista restante, pero esa función acumulaba por id y nunca borraba:
  el id quitado seguía en `~/.openexpert/drive-grants.json`, `search_drive` lo seguía listando y
  `read_drive_file` devolvía su contenido, así que el usuario creía haber retirado el permiso y el
  modelo lo conservaba (la única revocación real era «Desconectar», que borra todos). Ahora el Picker
  añade con `addGrantedFiles` (sigue acumulando y conserva el `addedAt` original) y la papelera llama
  a `revokeGrantedFile`, que borra el id del fichero de concesiones, recalcula los tipos de la
  integración y deja traza en el registro de actividad.
- 2f6c6b6: Las diapositivas de un `.pptx` se leen en el orden del mazo, no en el de los nombres de fichero.
  `pptxText` ordenaba las entradas del ZIP con un `.sort()` de cadenas, así que `slide10.xml` caía
  entre `slide1.xml` y `slide2.xml`: en un mazo de diez o más diapositivas el modelo recibía la 2, la
  3… después de la 12 y contestaba «qué dice la diapositiva 3» o «qué va justo después del índice»
  con el fragmento equivocado, sin ningún error a la vista. Ahora el orden sale del número de la
  diapositiva comparado como entero, que es lo que `read_drive_file` y `read_local_file` entregan al
  modelo como si fuera el documento en orden.
- d5b1179: La lectura de `openexpert.json` recorta los límites, como ya hacían la escritura y la restauración.

  Los topes de `chat.maxSteps` (200 pasos), `chat.retentionDays` (3650 días) y `ai.maxOutputTokens`
  (200000 tokens) existían en la puerta de escritura —el panel de ajustes y el editor en crudo los
  rechazan— y en la de la restauración de una copia. Faltaba la tercera: la **lectura**, que es la que
  ocurre cada vez que la aplicación arranca. El fichero manda, así que un `openexpert.json` escrito a
  mano (la documentación dice que se puede editar a mano), o uno de una versión anterior a los topes,
  dejaba la instalación con 100000 pasos por consulta —100000 llamadas facturables al proveedor en una
  sola petición—, con la purga del historial desactivada de golpe y con 100 millones de tokens de
  salida en un turno. Y no se avisaba de nada: el panel enseñaba los valores por defecto (50 pasos, 30
  días) mientras el proceso corría con 100000.

  Ahora el recorte va en el lector del paquete (`packages/openexpert/src/config.ts`), que es el mismo
  por el que pasan el servidor y el CLI, y los números viven allí: el panel y el editor en crudo los
  toman del paquete, así que no hay dos copias que puedan separarse.

  El caso grave era la lista de patrones de inyección: cada patrón se **mide** contra una entrada
  adversaria antes de usarse, así que una lista de cinco mil costaba treinta segundos de hilo
  bloqueado en el primer chat (medido: 30 274 ms antes, 337 ms ahora con la lista acotada a cincuenta,
  el mismo máximo que acepta el panel).

  Y un límite recortado se anuncia, nunca en silencio: el diagnóstico de Ajustes → Avanzado lista lo que
  se cortó y a qué, y `openexpert doctor` dice lo mismo. Un fichero que dice una cosa y una aplicación
  en marcha que hace otra es algo que hay que contarle a quien lo tiene.

- 959e804: Las herramientas de archivos locales dicen cuándo se han cortado, en vez de presentar el tope como el
  total. El recorrido de una carpeta concedida se para en 5 000 archivos y 8 niveles, y ese tope
  viajaba al modelo como si fuera el dato: `list_local_files` contestaba `total: 5000` sobre una
  carpeta de 20 000 archivos y `search_local_files` devolvía 200 coincidencias sin decir cuántas había,
  así que la respuesta era «no hay ningún archivo que mencione eso» con el archivo dentro de la
  carpeta. Ahora el recorrido devuelve `{ files, truncated }` y los topes se anuncian: `truncated:
true` cuando el recorrido se cortó (por número de archivos o por profundidad), `total` solo cuando
  es un recuento de verdad, y en `search_inside_files` la nota distingue las dos razones de pararse —
  «hay más coincidencias» cuando se llenó el cupo de resultados y «quedan N archivos sin revisar»
  cuando lo que se acabó fue el cupo de archivos, que antes decía lo primero en los dos casos.
- 6b8f170: La interfaz en inglés deja de tener frases en español. Faltaban 15 cadenas en
  `src/locales/en.ts` —17 llamadas— y el respaldo de `translate` las mostraba tal
  cual, sin avisar: la página 404 y la de error entera, el botón «Reintentar» de la
  barra de error, el texto para lectores de pantalla del selector de Experto,
  «Pensando…» del chat, «Clave de API», la opción de leer PDF escaneados con su
  explicación, «Fuentes pendientes» y «Entidades» en Fuentes, la descripción de
  Integraciones y la pregunta de borrar `openexpert.json`. Ahora están traducidas y
  `src/locales/en.test.ts` compara cada `t("…")` literal de `src/` con el
  diccionario, así que un hueco nuevo tumba la suite en vez de aparecer en pantalla.
- 7a45be6: La transcripción de un PDF escaneado anuncia su recorte. La transcripción se cortaba en 200.000
  caracteres sin decirlo, y lo que quedaba fuera no se podía volver a pedir: `extractText` devolvía
  `{ text }` y descartaba la nota, así que `read_local_file` entregaba la transcripción en una sola
  ventana, sin `hasMore`, y el modelo resumía la primera mitad como si fuera el documento entero. Ahora
  la transcripción que se recorta trae `truncated`, los caracteres que se transcribieron y una nota
  («La transcripción del PDF se ha recortado a 200.000 caracteres de 300.000: el final del documento
  no está en lo que se lee»), y la lectura la propaga; un documento que cabe entero sigue llegando sin
  aviso.
- 1b6ec86: La ventana de lectura ya no parte un emoji por la mitad. El presupuesto se cuenta en unidades
  UTF-16 y el corte caía entre las dos mitades de un par suplente, así que la ventana terminaba en
  `\uD83D` suelto y la siguiente empezaba por `\uDE00`: el modelo leía un carácter roto en cada
  frontera de un documento con emojis, CJK del plano 1 o cualquier carácter fuera del plano básico.
  Ahora el corte se echa atrás hasta una frontera de carácter y el cursor (`line`/`char`) la
  acompaña, de modo que recomponer las ventanas sigue dando el texto exacto; con un presupuesto de
  una sola unidad se lleva el carácter entero, una unidad de más, antes que una ventana vacía que no
  mueva el cursor. Afecta a los tres lectores que comparten `takeWindow`: `read_local_file`,
  `read_drive_file` y la lectura de CSV.
- 7ed8120: El workspace deja de llevar las facturas y las campañas enteras. `getWorkspace` devolvía
  `invoices` y `campaigns` completas desde las tablas, y la ventana se refresca cada 15 s mientras la
  app está abierta: con la base en el tope del importador (5.000 facturas y 5.000 campañas) eso eran
  872 KB por lectura, de los que 870 KB eran las dos listas. Ningún componente las lee —las facturas
  y las campañas aparecen en la pantalla como recuento y en el chat como salida de sus herramientas,
  que ya paginan y dicen cuántas filas dejan fuera— así que viajaban para nada en cada refresco. El
  workspace se queda con lo que la ventana pinta (propietario, Expertos, integraciones, la ventana del
  registro de actividad y su total) y con `businessRows`, el recuento de filas de negocio: un CRM
  importado sigue contando como «hay datos» y el chat no vuelve a decir que no hay nada que consultar.
- f94010b: Las hojas de Excel informan de las filas de datos, no de la cabecera. `xlsxText` publicaba
  `rows: sheetLines.length - 1`, que descuenta la línea con el nombre de la hoja y no la cabecera, así
  que la cabecera quedaba contada como fila de datos: un `.xlsx` con cabecera y tres filas
  (Ana, Luis, Marta) se anunciaba como cuatro. El modelo recibe ese número por `read_local_file` y lo
  repite al usuario, de modo que una tabla de tres filas se contaba como de cuatro con toda la
  confianza y sin ningún error a la vista. El comentario del código ya decía lo correcto y la ruta CSV
  (`csvStructure`) sí descontaba la cabecera, así que el mismo campo `rows` significaba dos cosas
  según el formato. Ahora `rows` cuenta filas de datos en los dos, la cabecera vive solo en
  `columns`, una hoja con solo cabecera da `0` y una hoja vacía no da negativo. La descripción de
  `read_local_file` lo dice también, para que el modelo no tenga que adivinarlo.

## 0.5.1

### Patch Changes

- 2cc57a0: Escritorio: el lanzador ya no inyecta `desktop` en todos los comandos, así que
  `openexpert doctor`, `fix`, `init`, `serve` y `version` ejecutan el CLI sin abrir
  la ventana (solo `openexpert` sin argumentos, o `openexpert desktop`, arranca la
  interfaz). La ventana carga el puerto que sirve el comando (`PORT=3100`) en vez
  del 3000 compilado en el binario, y el instalador comprueba lo que escribe: un
  lanzador que ejecuta un fichero que ya no existe falla en vez de darse por bueno.
  Una sola versión manda: `npm run desktop:sync-version` escribe
  `tauri.conf.json`, `Cargo.toml` y `Cargo.lock` desde el manifiesto del paquete.
- cbefb87: Cierra las rutas de fallo que dejaban la instalación muerta, colgada o sin rastro: la base de datos
  se reintenta tras un arranque fallido (antes quedaba envenenada hasta reiniciar), una copia de
  seguridad se valida antes de sustituir nada y deja la anterior en `openexpert.db.bak` con vuelta
  atrás, una `secret.key` dañada falla en voz alta en vez de regenerarse encima de los tokens, los
  patrones de inyección con cuantificadores anidados se rechazan (congelaban el servidor 59 s con 29
  caracteres), las llamadas a Drive y Notion llevan timeout, los fallos del registro de auditoría se
  registran con contexto y `run_python` ya no bloquea el bucle de eventos.
- 295634b: `run_python` deja de tener red: el script se ejecuta dentro de un espacio de nombres
  aislado (`bubblewrap`; si no está, `unshare -n`) y, cuando el sistema no puede crear
  ninguno, la herramienta se niega a ejecutar. Con `bubblewrap` tampoco ve el resto del
  disco. La descripción de la herramienta y la documentación dicen ahora exactamente eso.

  El despliegue Docker publica la app y Ollama solo en `127.0.0.1`, porque el panel no
  tiene login, y queda escrito en el compose y en `docker/README.md`.

  El control de origen de `/api/*` valida el `Host` y el `Origin` contra los hosts que el
  servidor sirve, no contra el `Host` de la petición: cierra el DNS rebinding. Un `POST`
  sin `Origin` ya no se da por bueno.

## 0.5.0

### Minor Changes

- 7cd398e: El paquete pasa a llamarse `@openexpert/openexpert` y su único binario es
  `openexpert`: el producto, el paquete, el CLI y la versión comparten un solo
  nombre. Las releases se etiquetan `v<versión>` y se titulan `OpenExpert <versión>`.
  El paquete anterior (`@openexpert/opencore`) queda obsoleto y señala a este; el CLI
  conserva la forma antigua del tag para poder descargar el bundle de una versión
  publicada antes del cambio.

## 0.4.0

### Minor Changes

- a000fc1: Una clave por proveedor: dos fichas del catálogo ya no pueden declarar la misma
  variable de clave, así que guardar la de un proveedor nunca pisa la de otro.
  OpenCode Go pasa a tener `OPENCODE_GO_API_KEY` en vez de compartir la ranura
  genérica. Preguntar a un proveedor qué modelos sirve pasa a ser un único camino
  de código (`listProviderModels`), que usan la aplicación y el CLI, y cubre el
  adaptador de Anthropic además de los endpoints compatibles.

## 0.3.1

### Patch Changes

- b710215: - `serve` and `desktop` start the local server on `127.0.0.1` instead of every
  interface, and `desktop` refuses a port owned by another application instead of
  pointing the window at it. `OPENEXPERT_HOST` (or `HOST`) exposes it on purpose.
  - `doctor` and `models` read the provider from the directory they were given,
    not from the process working directory.

## 0.3.0

### Minor Changes

- 096d377: Raise the default sampling `ai.temperature` from 0.2 to 0.5.
- 214e8a6: Add `notionClientId` to `openexpert.json` (the non-secret Notion OAuth client ID),
  mirroring `googleClientId`. The client secret stays in `secrets.json` /
  environment.
- d13e226: Remove the autonomous-process tools (`list_processes`, `request_process_run`) and
  the `processes` table name from the storage interface. The feature was a mock and
  has been removed from the app; see the roadmap to rebuild it for real.

### Patch Changes

- 83028ca: Normalise the Ollama base URL without the `/\/+$/` regex, which CodeQL reports as
  a polynomial ReDoS on a long run of slashes. Trailing slashes are now stripped
  with a loop; the `http://host`, `http://host/` and `http://host/v1` shapes keep
  behaving exactly as before.

## 0.2.1

### Patch Changes

- 3e4755d: Fix the release automation: use `changesets/action@v2`. `@changesets/cli@3` no
  longer prints the `New tag:` line that the v1 action parsed, so releases were
  published to npm but no git tags, GitHub releases or Docker images were created.

## 0.2.0

### Minor Changes

- 949ddf9: Add the `opencore desktop` command: it starts (or reuses) the local server and
  opens the native OpenExpert window (Tauri + WebKitGTK), then stops the server
  when the window closes.
- 949ddf9: OpenCore — the MIT engine and CLI of the local edition.

  - Model provider selector: `google` (Gemini), `ollama` (local) and
    `openai-compatible` (BYOK).
  - `config` loader (`openexpert.json` + `OPENEXPERT_*`), storage/token
    interfaces and the tool catalog.
  - CLI: interactive setup wizard plus `doctor`, `fix`, `models`, `serve` and
    `update`.
  - Built with `tsup` (ESM + `.d.ts`); `main`/`exports`/`types`/`files` set.

- a780ea0: Simplify the local edition surface:

  - Drop the unused `chat.defaultApproval` option from `ChatConfig`, the JSON
    schema and the settings panel.
  - `TableName`/`LOCAL_TABLES` now list the real local tables (`deals`,
    `accounts`, `settings`, …) instead of removed multi-user tables.
  - Normalise `OLLAMA_BASE_URL`: accept the native root or the `/v1` URL for both
    chat and model listing.

- 949ddf9: Require Node.js 24 or later (npm 11+). Node.js 20 is end-of-life and the
  build/test toolchain (Vite 8, Vitest 5, Changesets 3) now targets Node.js 24.
- 949ddf9: Add `chat.injectionExtraPatterns` to the configuration file, and wire the chat
  options (maxSteps, injection guard, retention) into the
  endpoint. Adds the advanced diagnostics and raw-config editor to the settings
  panel.
- 949ddf9: Extend `openexpert.json` with `ai` (temperature, topP, maxOutputTokens) and
  `chat` (maxSteps, injectionGuard, retentionDays) options, with
  matching JSON-schema and `loadConfig` support.
