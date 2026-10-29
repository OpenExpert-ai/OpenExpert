// SPDX-License-Identifier: MIT
// English dictionary. Keys are the Spanish source strings used with `t()`.
// Any missing entry falls back to the Spanish text, so the app stays usable
// while translations are completed.

export const en: Record<string, string> = {
  // --- Shell -----------------------------------------------------------------
  "Habla con tu empresa": "Talk to your company",
  Expert: "Expert",
  Experts: "Experts",
  "Registro de Actividad": "Activity log",
  Configuración: "Settings",
  Local: "Local",
  "Cargando espacio de trabajo…": "Loading workspace…",
  Reintentar: "Try again",
  "Experto activo": "Active expert",

  // --- Errors ----------------------------------------------------------------
  // The 404 and the root error boundary are the two screens a user reaches when
  // something has already gone wrong, so they cannot be the ones left in
  // Spanish.
  "Página no encontrada": "Page not found",
  "La página que buscas no existe o se ha movido.":
    "The page you are looking for doesn't exist or has moved.",
  "Volver al inicio": "Back to home",
  "Esta página no se pudo cargar": "This page couldn't be loaded",
  "Algo ha fallado. Prueba a recargar o vuelve al inicio.":
    "Something went wrong. Try reloading or go back to the start.",

  // --- Settings layout -------------------------------------------------------
  Ajustes: "Settings",
  "Modelo de IA, apariencia y datos de tu instalación local. Todo se guarda en tu equipo.":
    "AI model, appearance and data for your local install. Everything is stored on your machine.",
  "Modelo e IA": "Model & AI",
  "Chat y agentes": "Chat & agents",
  "Datos y copias": "Data & backups",
  Apariencia: "Appearance",
  Avanzado: "Advanced",
  "Acerca de": "About",

  // --- Settings: model & AI --------------------------------------------------
  "Proveedor de IA": "AI provider",
  "Elige dónde se ejecuta el modelo. Cada proveedor guarda su propia clave: cambiar de uno a otro no borra la del anterior.":
    "Choose where the model runs. Each provider keeps its own key: switching from one to another does not erase the previous one.",
  Proveedor: "Provider",
  "Ollama (local)": "Ollama (local)",
  "Google Gemini": "Google Gemini",
  "Anthropic (Claude)": "Anthropic (Claude)",
  "OpenAI-compatible (BYOK)": "OpenAI-compatible (BYOK)",
  "OpenCode Go": "OpenCode Go",
  "Local y sin claves: nada sale de tu equipo.": "Local and keyless: nothing leaves your machine.",
  "Clave gratuita de AI Studio. Los datos salen a Google.":
    "Free key from AI Studio. Data leaves for Google.",
  "Modelos Claude. Su clave es independiente de la de los demás.":
    "Claude models. Its key is independent from the others.",
  "Tu propio endpoint. Los datos salen a donde apuntes.":
    "Your own endpoint. Data leaves for wherever you point it.",
  "Solo este proveedor manda la cabecera de sesión que su servicio pide.":
    "Only this provider sends the session header its service asks for.",
  "Acepta la raíz nativa o la URL /v1: se normaliza.":
    "Accepts the native root or the /v1 URL: it is normalised.",
  "Endpoint compatible con OpenAI, con /v1 al final.":
    "OpenAI-compatible endpoint, with /v1 at the end.",
  "Sin clave (local)": "No key (local)",
  "Elegido: {a}. Su clave se guarda como {b}.": "Selected: {a}. Its key is stored as {b}.",
  "ninguna (no usa)": "none (it uses no key)",
  variable: "variable",
  Endpoint: "Endpoint",
  "En uso": "In use",
  "Obtener una clave": "Get a key",
  "Endpoint del proveedor:": "Provider endpoint:",
  "Este proveedor pide la cabecera {h} en cada petición.":
    "This provider asks for the {h} header on every request.",
  Modelo: "Model",
  "Identificador del modelo tal y como lo conoce el proveedor.":
    "The model identifier as the provider knows it.",
  "URL de Ollama": "Ollama URL",
  "Endpoint compatible con OpenAI (con /v1 al final).":
    "OpenAI-compatible endpoint (with /v1 at the end).",
  "Base URL": "Base URL",
  "API key": "API key",
  "API key de Gemini": "Gemini API key",
  "Clave de API": "API key",
  "Dejar vacío para no cambiarla": "Leave empty to keep it unchanged",
  Revelar: "Reveal",
  Borrar: "Clear",
  "Parámetros de muestreo": "Sampling parameters",
  "Controlan cómo de creativo y largo es el modelo.":
    "Control how creative and how long the model is.",
  "Top P": "Top P",
  "Máx. tokens": "Max tokens",
  Guardar: "Save",
  "Guardar cambios": "Save changes",
  Guardando: "Saving",
  "Probar conexión": "Test connection",
  "Se guarda en {a} y {b}.": "Stored in {a} and {b}.",
  Definida: "Set",
  "No definida": "Not set",
  "Listando…": "Listing…",
  Listar: "List",

  // --- Settings: appearance --------------------------------------------------
  Tema: "Theme",
  "Se aplica al instante y se guarda en tu equipo.":
    "Applied instantly and stored on your machine.",
  Oscuro: "Dark",
  "Interfaz oscura": "Dark interface",
  Claro: "Light",
  "Interfaz clara": "Light interface",
  Sistema: "System",
  "Según tu sistema operativo": "Follow your operating system",
  Densidad: "Density",
  "Controla el tamaño base del texto.": "Controls the base text size.",
  Cómoda: "Comfortable",
  "Texto a 15 px": "Text at 15 px",
  Compacta: "Compact",
  "Texto a 14 px": "Text at 14 px",
  Idioma: "Language",
  "Idioma de la interfaz.": "Interface language.",
  Español: "Spanish",
  Inglés: "English",

  // --- Settings: chat --------------------------------------------------------
  "Seguridad del chat": "Chat security",
  "La puerta de inyección bloquea intentos de evasión antes de llamar al modelo.":
    "The injection gate blocks evasion attempts before calling the model.",
  "Activar guardia anti-inyección": "Enable injection guard",
  "Recomendado. Si se desactiva, los intentos de evasión no se bloquean ni se registran.":
    "Recommended. If disabled, evasion attempts are neither blocked nor logged.",
  "Patrones extra (uno por línea)": "Extra patterns (one per line)",
  "Expresiones regulares adicionales. Se ignoran las inválidas; al guardar se rechazan las que pueden congelar el servidor, comprobando lo que tardan en ejecutarse contra un mensaje largo (no solo las que repiten un grupo con un cuantificador o una alternación dentro).":
    "Additional regular expressions. Invalid ones are ignored; on save, any that could freeze the server are rejected by measuring how long they take against a long message (not only those repeating a group already carrying a quantifier or an alternation).",
  Comportamiento: "Behaviour",
  "Límites de ejecución y conservación de conversaciones.":
    "Execution limits and conversation retention.",
  "Máx. pasos por consulta": "Max steps per request",
  "Número máximo de pasos con herramientas.": "Maximum number of tool-calling steps.",
  "Retención (días)": "Retention (days)",
  "0 desactiva la purga automática.": "0 disables automatic pruning.",
  "Leer PDF escaneados con el modelo": "Read scanned PDFs with the model",
  "Cuando un PDF no tiene texto (es la foto de una página), se transcribe con el modelo activo. Eso manda el documento al proveedor: actívalo solo si eso te parece bien. Necesita un proveedor que vea documentos.":
    "When a PDF has no text (it is a photo of a page), it is transcribed with the active model. That sends the document to the provider: enable it only if that is fine by you. It needs a provider that can see documents.",
  "Aprobación por defecto": "Default approval",
  Requerida: "Required",
  Ninguna: "None",
  "Ajustes de chat guardados": "Chat settings saved",

  // --- Settings: data --------------------------------------------------------
  Estado: "Status",
  "Resumen de los datos que guarda tu instalación.": "Summary of the data your install holds.",
  "Base de datos": "Database",
  Integraciones: "Integrations",
  Eventos: "Events",
  Mensajes: "Messages",
  "Datos de negocio": "Business data",
  "Importa un CSV o carga un juego de ejemplo para probar el panel.":
    "Import a CSV or load a sample dataset to try the dashboard.",
  "Tipo de datos": "Data type",
  "Importar CSV": "Import CSV",
  Plantilla: "Template",
  "La plantilla trae las cabeceras que entiende el importador; también acepta una exportación con nombres equivalentes en español o inglés.":
    "The template carries the headers the importer understands; an export with equivalent Spanish or English names also works.",
  Campañas: "Campaigns",
  Cuentas: "Accounts",
  "De ejemplo: {n}": "Sample rows: {n}",
  "Cargar datos de ejemplo": "Load sample data",
  "Quitar datos de ejemplo": "Remove sample data",
  "Los datos de ejemplo se marcan como demo y se quitan sin tocar los reales.":
    "Sample rows are marked as demo and can be removed without touching real data.",
  "Importados {n} registros de {entity}": "Imported {n} {entity} records",
  "{n} fila con error; la primera, línea {row}: {message}":
    "{n} row failed; the first at line {row}: {message}",
  "{n} filas con error; la primera, línea {row}: {message}":
    "{n} rows failed; the first at line {row}: {message}",
  "Se detallan solo las {n} primeras.": "Only the first {n} are listed.",
  "{n} fila no se importó: el tope es de {max} filas por importación.":
    "{n} row was not imported: the limit is {max} rows per import.",
  "{n} filas no se importaron: el tope es de {max} filas por importación.":
    "{n} rows were not imported: the limit is {max} rows per import.",
  "CSV no válido": "Invalid CSV",
  "Datos de ejemplo quitados": "Sample data removed",
  "Cargados {n} registros de ejemplo": "Loaded {n} sample records",
  "Conectores de negocio": "Business connectors",
  "Opcionales. Se conectan con tu clave y solo leen; los datos se quedan en tu equipo.":
    "Optional. They connect with your key and only read; the data stays on your machine.",
  Conectado: "Connected",
  "Sin conectar": "Not connected",
  "Última sync: {date}": "Last sync: {date}",
  "API token de Pipedrive": "Pipedrive API token",
  "API key de Holded": "Holded API key",
  "Conectar y sincronizar": "Connect and sync",
  "Clave guardada; pulsa Sincronizar.": "Key stored; press Sync now.",
  "Las claves se guardan en secrets.json con permisos 0600; solo se leen datos del conector.":
    "Keys are stored in secrets.json with mode 0600; only connector data is read.",
  "Conectado: {n} registros": "Connected: {n} records",
  "Conectado: {n} registros; la descarga se cortó en el tope y hay más sin traer":
    "Connected: {n} records; the download hit the cap and more rows were left behind",
  "Sincronizados {n} registros": "Synced {n} records",
  "Sincronizados {n} registros; la descarga se cortó en el tope y hay más sin traer":
    "Synced {n} records; the download hit the cap and more rows were left behind",
  Desconectado: "Disconnected",
  "Copia de seguridad": "Backup",
  "Contraseña de la copia": "Backup passphrase",
  "Mínimo 8 caracteres": "At least 8 characters",
  "Descargar cifrada": "Download encrypted",
  "Copia cifrada descargada": "Encrypted backup downloaded",
  "La copia cifrada pide esta contraseña al restaurar; si la pierdes, no se puede abrir.":
    "The encrypted backup asks for this passphrase when restoring; if you lose it, it cannot be opened.",
  "La copia está cifrada: escribe su contraseña para restaurarla.":
    "The backup is encrypted: enter its passphrase to restore it.",
  "Contraseña incorrecta o copia dañada.": "Wrong passphrase or damaged backup.",
  "Incluye la base de datos, la configuración, las credenciales locales y el estado de tus integraciones.":
    "Includes the database, the configuration, the local credentials and the state of your integrations.",
  "La copia lleva la clave que descifra esas credenciales: quien tenga el fichero puede leer tus tokens. Guárdala como guardarías las credenciales.":
    "The backup also carries the key that decrypts those credentials: whoever holds the file can read your tokens. Store it as you would store the credentials.",
  "La copia no traía: {list}. Si los usabas, tendrás que configurarlos otra vez.":
    "The backup did not include: {list}. If you were using them, you will have to set them up again.",
  "Credenciales de Drive": "Drive credentials",
  "Clave local": "Local key",
  "Concesiones del Picker": "Picker grants",
  "Consentimiento de Drive": "Drive consent",
  "Descargar copia": "Download backup",
  "Importar copia": "Import backup",
  "Importar {b} los datos actuales. Se recomienda descargar una copia antes.":
    "Importing {b} the current data. Download a backup first.",
  Mantenimiento: "Maintenance",
  "Operaciones rápidas sobre la base de datos.": "Quick database operations.",
  "Compactar (VACUUM)": "Compact (VACUUM)",
  "Borrar historial de chat": "Clear chat history",
  "Zona de peligro": "Danger zone",
  "Restaura la base de datos a su estado inicial (vacía, sin datos de negocio). La configuración y las credenciales no se tocan.":
    "Restores the database to its initial state (empty, no business data). Configuration and credentials are untouched.",
  "Escribe {word} para confirmar. Esta acción no se puede deshacer.":
    "Type {word} to confirm. This action cannot be undone.",
  "Restaurar datos iniciales": "Reset data",

  // --- Settings: advanced ----------------------------------------------------
  Diagnóstico: "Diagnostics",
  "Estado de tu instalación local.": "Status of your local install.",
  "Google Drive": "Google Drive",
  "Credenciales configuradas": "Credentials configured",
  "Sin credenciales OAuth": "No OAuth credentials",
  "Carpeta de datos": "Data folder",
  "Límites del fichero": "File limits",
  "El fichero pide valores que la aplicación no usa: se han recortado al límite.":
    "The file asks for values the application does not use: they were cut back to the limit.",
  "{field}: {dropped} patrones descartados (el máximo son {limit})":
    "{field}: {dropped} patterns dropped (the maximum is {limit})",
  "{field}: {value} traídos a {limit}": "{field}: {value} cut back to {limit}",
  "{n} {unit}": "{n} {unit}",
  "pasos por consulta": "steps per query",
  días: "days",
  tokens: "tokens",
  "Variable de entorno": "Environment variable",
  "Variables de entorno": "Environment variables",
  "Solo lectura. Las variables reales tienen prioridad.":
    "Read-only. Real environment variables take precedence.",
  Variable: "Variable",
  Origen: "Source",
  Valor: "Value",
  entorno: "environment",
  "por defecto": "default",
  "Edición directa del fichero. Se valida antes de guardar.":
    "Direct file editing. Validated before saving.",
  "Restaurar por defecto": "Restore defaults",
  "¿Eliminar openexpert.json y volver a los valores por defecto?":
    "Delete openexpert.json and go back to the defaults?",

  // --- Settings: about -------------------------------------------------------
  Versión: "Version",
  Puerto: "Port",
  Licencia: "License",
  Rutas: "Paths",
  Datos: "Data",
  "El fichero de secretos se guarda con permisos {p0}.":
    "The secrets file is stored with {p0} permissions.",
  "Edición local, propietario único. Todos los datos permanecen en tu equipo.":
    "Local edition, single owner. All data stays on your machine.",

  // --- Activity --------------------------------------------------------------
  Auditoría: "Audit",
  "Todos los actores": "All actors",
  Humano: "Human",
  Agente: "Agent",
  "Todos los tipos": "All types",
  "Todos los Experts": "All Experts",
  "Todos los estados": "All statuses",
  "{a} de {b} evento": "{a} of {b} event",
  "{a} de {b} eventos": "{a} of {b} events",
  "fuentes:": "sources:",
  Aprobar: "Approve",
  Rechazar: "Reject",
  Revertir: "Revert",
  "Solo ADMIN": "ADMIN only",
  "Sin eventos para estos filtros.": "No events for these filters.",
  "Estado restaurado desde snapshot": "State restored from snapshot",
  "¿Revertir {id}?": "Revert {id}?",

  // --- Experts ---------------------------------------------------------------
  "Aislamiento de contexto": "Context isolation",
  "Cada Experto solo ve sus fuentes conectadas y responde dentro de su dominio.":
    "Each Expert only sees its connected sources and answers within its domain.",
  "Nuevo Experto": "New Expert",
  Activo: "Active",
  Activar: "Activate",
  Fuentes: "Sources",
  "Sin fuentes": "No sources",
  off: "off",
  "Nombre (p. ej. Operaciones)": "Name (e.g. Operations)",
  "Descripción y alcance": "Description and scope",
  "Integraciones conectadas": "Connected integrations",
  "Creando…": "Creating…",
  "Crear Experto": "Create Expert",
  "Experto creado": "Expert created",
  "Experto actualizado": "Expert updated",
  "Experto eliminado": "Expert deleted",
  "Editar Experto": "Edit Expert",
  "Eliminar Experto": "Delete Expert",
  "¿Eliminar este Experto?": "Delete this Expert?",
  "Se borrarán sus conversaciones. Podrás revertir el Experto desde el Registro, pero no las conversaciones.":
    "Its conversations will be deleted. You can revert the Expert from the Activity log, but not the conversations.",
  Dominios: "Domains",
  "Dominios de datos": "Data domains",
  "Sin dominios": "No domains",
  "Determina qué datos de negocio puede consultar. Sin dominios, el Experto solo puede chatear y usar Drive.":
    "Decides which business data it may read. With no domains, the Expert can only chat and use Drive.",
  Ventas: "Sales",
  Finanzas: "Finance",
  Marketing: "Marketing",
  "Cuentas / churn": "Accounts / churn",
  Cancelar: "Cancel",

  // --- Integrations ----------------------------------------------------------
  "Fuentes de Datos": "Data sources",
  "Fuentes de datos conectadas a tus Expertos.": "Data sources connected to your Experts.",
  "Fuentes pendientes": "Pending sources",
  Entidades: "Entities",
  Pendiente: "Pending",
  conectado: "connected",
  desconectado: "disconnected",
  "Conectar mi cuenta": "Connect my account",
  "Abriendo Google…": "Opening Google…",
  "Sincronizando…": "Syncing…",
  Sincronizar: "Sync",
  Desconectar: "Disconnect",
  "Entidades sincronizadas": "Synced entities",
  "Tu cuenta de Google está conectada": "Your Google account is connected",
  "Conecta tu cuenta de Google para buscar, leer y crear archivos":
    "Connect your Google account to search, read and create files",
  "Google Drive conectado": "Google Drive connected",
  "No se pudo conectar Google Drive": "Could not connect Google Drive",
  "Google Drive sincronizado": "Google Drive synced",
  "Google Drive desconectado": "Google Drive disconnected",
  "Acceso retirado: el Experto ya no puede leer ese archivo.":
    "Access revoked: the Expert can no longer read that file.",

  // --- Data sources: Drive & Notion cards ------------------------------------
  "Notion conectado.": "Notion connected.",
  "Google Drive conectado. Ahora selecciona archivos con el Picker.":
    "Google Drive connected. Now select files with the Picker.",
  "Falta configurar el cliente OAuth en el servidor.":
    "The OAuth client is not configured on the server.",
  "Configura GOOGLE_PICKER_API_KEY en el archivo de secretos para habilitar el Picker.":
    "Set GOOGLE_PICKER_API_KEY in the secrets file to enable the Picker.",
  "No se seleccionó ningún archivo (acción del Picker: {action}).":
    "No file was selected (Picker action: {action}).",
  desconocida: "unknown",
  "Abriendo Picker…": "Opening the Picker…",
  "Seleccionar archivos": "Select files",
  "{n} archivo añadido.": "{n} file added.",
  "{n} archivos añadidos.": "{n} files added.",
  "El tope de 5.000 archivos concedidos ha retirado {n} archivo: {names}. Vuelve a elegirlo en el Picker si lo necesitas.":
    "The 5,000-grant cap has dropped {n} file: {names}. Pick it again in the Picker if you need it.",
  "El tope de 5.000 archivos concedidos ha retirado {n} archivos: {names}. Vuelve a elegirlos en el Picker si los necesitas.":
    "The 5,000-grant cap has dropped {n} files: {names}. Pick them again in the Picker if you need them.",
  "{n} archivo elegido": "{n} file selected",
  "{n} archivos elegidos": "{n} files selected",
  "Quitar archivo": "Remove file",
  "Aún no has elegido archivos. Pulsa “Seleccionar archivos”.":
    "You haven't selected any files yet. Press “Select files”.",
  "Pendiente de credenciales": "Awaiting credentials",
  "(Pronto)": "(Soon)",
  "OpenExpert usa": "OpenExpert uses",
  "(no sensible, archivo por archivo). Solo ves lo que elijas en el Picker. El contenido se envía al proveedor del modelo (por defecto local) para responderte.":
    "(non-sensitive, file by file). You only see what you select in the Picker. Content is sent to the model provider (local by default) to answer you.",

  // --- Drive consent dialog ---------------------------------------------------
  "Conectar Google Drive": "Connect Google Drive",
  "OpenExpert va a acceder a Google Drive con tu consentimiento. Antes de continuar, confirma que entiendes lo siguiente:":
    "OpenExpert is going to access Google Drive with your consent. Before continuing, confirm that you understand the following:",
  "Solo pedimos el scope": "We only ask for",
  "(no sensible). El asistente no puede leer ni listar tu Drive completo.":
    "(the non-sensitive scope). The assistant cannot read or list your whole Drive.",
  "Con el Picker elegirás": "With the Picker you'll choose",
  "archivo por archivo": "file by file",
  "qué puede ver OpenExpert.": "what OpenExpert can see.",
  "El contenido de los archivos elegidos se transmite al modelo para responderte; usa":
    "The content of the files you select is sent to the model to answer you; use",
  "Ollama local": "local Ollama",
  "si no quieres que salga de tu equipo.": "if you don't want it to leave your machine.",
  "No usamos tus datos para entrenar modelos. No los vendemos ni los cedemos a terceros.":
    "We don't use your data to train models. We don't sell it or pass it on to third parties.",
  "Los tokens se guardan cifrados (AES-GCM) en": "Tokens are stored encrypted (AES-GCM) in",
  "con modo 0600.": "with mode 0600.",
  "Entiendo y conecto": "I understand and connect",

  // --- Local files -----------------------------------------------------------
  "Archivos locales": "Local files",
  "Carpetas locales": "Local folders",
  "{n} carpeta autorizada": "{n} authorised folder",
  "{n} carpetas autorizadas": "{n} authorised folders",
  "Ninguna carpeta autorizada": "No authorised folders",
  "Añadir carpeta": "Add folder",
  "El asistente puede leer y escribir (con tu aprobación) dentro de estas carpetas. El contenido se envía al modelo para responderte.":
    "The assistant can read and write (with your approval) inside these folders. Content is sent to the model to answer you.",
  "Quitar carpeta": "Remove folder",
  "Carpeta añadida": "Folder added",
  "Carpeta quitada": "Folder removed",
  "Elegir carpeta": "Choose folder",
  "Ruta absoluta (p. ej. /home/tu-usuario/Documentos)":
    "Absolute path (e.g. /home/your-user/Documents)",
  Ir: "Go",
  Subir: "Up",
  "Sin subcarpetas": "No subfolders",
  "Se muestran {shown} de {total} entradas": "Showing {shown} of {total} entries",
  "Añadiendo…": "Adding…",
  "Añadir esta carpeta": "Add this folder",
  "Solo se listan carpetas; no se lee ningún archivo al elegirlas.":
    "Only folders are listed; no file is read when choosing them.",
  "Escritura en archivos locales": "Write to local files",
  "Crear «{name}» en la carpeta {folder}": "Create “{name}” in folder {folder}",
  "Reescribir el archivo {path}": "Overwrite file {path}",
  "Aprobado. Escribiendo el archivo…": "Approved. Writing the file…",
  "Denegado. No se escribirá nada.": "Denied. Nothing will be written.",
  "Escritura local denegada": "Local write denied",
  "Escritura en Notion denegada": "Notion write denied",
  "Listando archivos locales": "Listing local files",
  "Buscando archivos locales": "Searching local files",
  "Leyendo archivo local": "Reading a local file",
  "Creando archivo local": "Creating a local file",
  "Actualizando archivo local": "Updating a local file",
  "Ejecutando Python": "Running Python",
  "Buscando dentro de los archivos": "Searching inside the files",

  // --- Notion ----------------------------------------------------------------
  Notion: "Notion",
  "Conectar Notion": "Connect Notion",
  "Notion desconectado": "Notion disconnected",
  "Falta configurar el cliente OAuth de Notion en el servidor.":
    "The Notion OAuth client is not configured on the server.",
  "Conecta tu Notion: al autorizar eliges qué páginas y bases comparte con OpenExpert. El asistente puede buscarlas, consultarlas y editarlas (con tu aprobación).":
    "Connect your Notion: when you authorize, you choose which pages and databases it shares with OpenExpert. The assistant can search, query and edit them (with your approval).",
  "Buscando en Notion": "Searching Notion",
  "Consultando base de Notion": "Querying a Notion database",
  "Consultando esquema de Notion": "Querying the Notion schema",
  "Leyendo página de Notion": "Reading a Notion page",
  "Creando página en Notion": "Creating a Notion page",
  "Actualizando página en Notion": "Updating a Notion page",
  "Añadiendo contenido en Notion": "Adding content in Notion",
  "Escritura en Notion": "Write to Notion",
  "Crear una página en la base {db}": "Create a page in database {db}",
  "Actualizar la página {id}": "Update page {id}",
  "Añadir contenido a la página {id}": "Add content to page {id}",
  "Aprobado. Escribiendo en Notion…": "Approved. Writing to Notion…",

  // --- Chat ------------------------------------------------------------------
  "¿Cómo va el pipeline comercial?": "How is the sales pipeline doing?",
  "Reclamar facturas vencidas > 5.000€": "Claim overdue invoices > €5,000",
  "Pausar campañas con CPA alto": "Pause campaigns with high CPA",
  "Crear nuevo Experto para Operaciones": "Create a new Expert for Operations",
  "Historial ({n})": "History ({n})",
  "Nueva conversación": "New conversation",
  "Se guardan 30 días desde el último mensaje": "Kept for 30 days since the last message",
  Conversación: "Conversation",
  "Eliminar conversación": "Delete conversation",
  "Habla con tu empresa.": "Talk to your company.",
  "Primeros pasos": "Getting started",
  "Analizando contexto…": "Analysing context…",
  "Pensando…": "Thinking…",
  "La respuesta falló. Puedes volver a intentarlo.": "The response failed. You can try again.",
  Nueva: "New",
  Enviar: "Send",
  Detener: "Stop",
  "Entrada por voz": "Voice input",
  "Escuchando…": "Listening…",
  "Pregunta u ordena algo a {name}…": "Ask or tell {name} something…",
  "{name} · local · las acciones sensibles requieren confirmación humana":
    "{name} · local · sensitive actions require human confirmation",
  Razonamiento: "Reasoning",
  "Solicitud denegada · política de seguridad": "Request denied · security policy",
  Copiado: "Copied",
  "Sin créditos de IA disponibles.": "No AI credits available.",
  "Demasiadas peticiones, espera unos segundos.": "Too many requests, wait a few seconds.",
  "No se pudo completar la respuesta.": "Could not complete the response.",
  "No se pudo usar el micrófono": "Could not use the microphone",
  "¿Eliminar esta conversación definitivamente?": "Delete this conversation permanently?",

  // --- added during migration ------------------------------------------------
  "Cargando…": "Loading…",
  Config: "Config",
  Secretos: "Secrets",
  "Copia restaurada": "Backup restored",
  "Copia no válida": "Invalid backup",
  "Copia anterior guardada en {path}": "Previous copy saved to {path}",
  "¿Borrar todo el historial de conversaciones?": "Delete the whole conversation history?",
  "Historial borrado ({n} mensaje)": "History cleared ({n} message)",
  "Historial borrado ({n} mensajes)": "History cleared ({n} messages)",
  "Base de datos compactada": "Database compacted",
  "Datos restaurados al estado inicial": "Data reset to the initial state",
  "Restaurando…": "Resetting…",
  "Importar reemplaza los datos actuales. Se recomienda descargar una copia antes.":
    "Importing replaces the current data. Downloading a backup first is recommended.",
  "No se pudo guardar": "Could not save",
  "Origen actual:": "Current source:",
  "Configuración guardada": "Configuration saved",
  "No se pudieron listar los modelos": "Could not list the models",
  "El proveedor no devolvió modelos": "The provider returned no models",
  "{n} modelo disponible": "{n} model available",
  "{n} modelos disponibles": "{n} models available",
  "Conexión correcta · {n} modelo": "Connection OK · {n} model",
  "Conexión correcta · {n} modelos": "Connection OK · {n} models",
  "No se pudo conectar": "Could not connect",
  "Preguntado por la configuración guardada.": "Asked about the saved configuration.",
  "Preguntado por lo que has escrito, sin guardar.":
    "Asked about what you wrote, without saving it.",
  "No hay valor definido": "No value set",
  "Cargando configuración…": "Loading configuration…",
  "variable de entorno": "environment variable",
  "valor por defecto": "default value",
  "Guardando…": "Saving…",
  escribible: "writable",
  "NO escribible": "NOT writable",
  "openexpert.json guardado": "openexpert.json saved",
  "JSON inválido": "Invalid JSON",
  "Configuración restaurada": "Configuration restored",
  "Cada consulta, acción y cambio de configuración queda trazado. Los ADMIN pueden revertir acciones con snapshot; las acciones pendientes se aprueban aquí o en el chat.":
    "Every query, action and configuration change is traced. ADMINs can revert actions with a snapshot; pending actions are approved here or in the chat.",
  Experto: "Expert",
  "1. Elige tu modelo con `openexpert init` (Ollama o Gemini).":
    "1. Choose your model with `openexpert init` (Ollama or Gemini).",
  "2. Conecta Google Drive, si quieres, en Integraciones → Fuentes.":
    "2. Connect Google Drive, if you want, under Integrations → Sources.",
  "3. Escribe tu primera pregunta abajo.": "3. Type your first question below.",
  Ejecución: "Execution",
  pasos: "steps",
  blocked: "blocked",
  done: "done",
  "working…": "working…",
  "Detalles técnicos": "Technical details",
  Copiar: "Copy",
  "Consultando pipeline comercial": "Querying the sales pipeline",
  "Listando oportunidades del CRM": "Listing CRM opportunities",
  "Leyendo facturas vencidas": "Reading overdue invoices",
  "Extrayendo métricas de campañas": "Fetching campaign metrics",
  CRM: "CRM",
  Facturación: "Billing",
  Publicidad: "Advertising",
  Clientes: "Customers",
  "Sin fuentes de negocio conectadas. Los conectores reales están en la hoja de ruta; hasta entonces el asistente no tiene datos que consultar.":
    "No business sources are connected. Real connectors are on the roadmap; until then the assistant has no data to query.",
  "Evaluando riesgo de churn": "Assessing churn risk",
  "Preparando reclamaciones de cobro": "Preparing payment claims",
  "Preparando pausa de campañas": "Preparing to pause campaigns",
  "Cargando plantilla de Experto": "Loading the Expert template",
  "Buscando en Google Drive": "Searching Google Drive",
  "Leyendo documento de Drive": "Reading a Drive document",
  "Creando archivo en Google Drive": "Creating a Google Drive file",
  "Actualizando archivo en Google Drive": "Updating a Google Drive file",
  "Saltar al contenido": "Skip to content",
  "No se pudo cargar tu espacio": "We couldn't load your workspace",
  "El servidor local no respondió. Comprueba que sigue en marcha e inténtalo de nuevo.":
    "The local server didn't respond. Check that it's still running and try again.",
  LOCAL: "LOCAL",
  "Experto · {name}": "Expert · {name}",
  "Cargando conversación…": "Loading conversation…",
  "El reconocimiento de voz no está disponible en este navegador.":
    "Voice input isn't available in this browser.",
  "¿Eliminar esta conversación?": "Delete this conversation?",
  "Se borrarán sus mensajes de forma permanente. Esta acción no se puede deshacer.":
    "Its messages will be permanently deleted. This can't be undone.",
  Eliminar: "Delete",
  "Elige tu modelo": "Choose your model",
  "Ollama, Gemini o tu propio endpoint.": "Ollama, Gemini or your own endpoint.",
  Configurar: "Set up",
  "Conecta Google Drive": "Connect Google Drive",
  "Opcional: leer, crear y editar tus documentos.":
    "Optional: read, create and edit your documents.",
  Gestionar: "Manage",
  Conectar: "Connect",
  "Pregunta lo que necesites": "Ask whatever you need",
  "Las acciones sensibles te pedirán aprobación antes de ejecutarse.":
    "Sensitive actions will ask for your approval before running.",
  "{n} mensaje": "{n} message",
  "{n} mensajes": "{n} messages",
  "en vivo": "live",
  "Confirmación humana obligatoria": "Human approval required",
  "Firma registrada: falta una segunda aprobación":
    "Signature recorded: a second approval is pending",
  "Acción ejecutada y registrada": "Action executed and logged",
  "Aprobar y ejecutar": "Approve and run",
  "Acción rechazada": "Action rejected",
  "1/2 firmas": "1/2 signatures",
  Ejecutado: "Executed",
  "Revertido desde snapshot": "Reverted from snapshot",
  Rechazado: "Rejected",
  "Experto creado y disponible en el selector superior.":
    "Expert created and available in the switcher above.",
  "Puedes activarlo cuando quieras": "You can activate it whenever you want",
  "Pipeline comercial": "Sales pipeline",
  "Valor abierto": "Open value",
  "Deals activos": "Active deals",
  "Win rate": "Win rate",
  "Previsión ponderada": "Weighted forecast",
  "Fuera de la previsión: {n} deal sin probabilidad declarada ({value})":
    "Outside the forecast: {n} deal with no declared probability ({value})",
  "Fuera de la previsión: {n} deals sin probabilidad declarada ({value})":
    "Outside the forecast: {n} deals with no declared probability ({value})",
  "Facturas vencidas": "Overdue invoices",
  Facturas: "Invoices",
  // Contadores de una integración (`syncedEntityLabel` en settings.data.tsx): el
  // nombre lo escribe la sincronización, así que la clave es la palabra guardada.
  Carpetas: "Folders",
  Documentos: "Documents",
  "Hojas de cálculo": "Spreadsheets",
  Presentaciones: "Presentations",
  "Otros archivos": "Other files",
  "Importe total": "Total amount",
  "Campañas activas · 7 días": "Active campaigns · 7 days",
  Activas: "Active",
  Gasto: "Spend",
  "Sobre CPA objetivo": "Over target CPA",
  "Riesgo de churn": "Churn risk",
  "Cuentas en riesgo": "Accounts at risk",
  "MRR expuesto": "MRR at risk",
  "Archivo creado en Drive": "File created in Drive",
  "Archivo actualizado en Drive": "File updated in Drive",
  Abrir: "Open",
  "Buscar en el registro…": "Search the log…",
  "Cargar más": "Load more",
  "Se listan los {n} eventos más recientes de {total}. Los anteriores se cargan con «Cargar más».":
    "Showing the {n} most recent events out of {total}. Load the older ones with “Load more”.",
  "No se pudieron cargar los eventos anteriores": "Couldn't load the older events",
  "No se encontraron eventos": "No events found",
  "No hay eventos todavía.": "No events yet.",
  "Sin resultados para «{q}».": "No results for “{q}”.",
  // --- Registro de actividad --------------------------------------------------
  // El tipo y el estado de un evento son datos de la base; lo que se traduce es
  // la etiqueta que se pinta (`src/lib/activity-labels.ts`).
  Hecho: "Done",
  Revertido: "Reverted",
  Denegado: "Denied",
  Fallido: "Failed",
  Cancelado: "Cancelled",
  Consulta: "Query",
  Seguridad: "Security",
  Integración: "Integration",
  Importación: "Import",
  Reversión: "Revert",
  Cobro: "Collection",
  "Cambio en campañas": "Campaign change",
  "Drive · creación": "Drive · creation",
  "Drive · edición": "Drive · edit",
  "Python · ejecución": "Python · run",
  "Notion · creación": "Notion · creation",
  "Notion · edición": "Notion · edit",
  "Archivos locales · creación": "Local files · creation",
  "Archivos locales · edición": "Local files · edit",
  "Copiada al portapapeles": "Copied to clipboard",
  "No se pudo copiar": "Couldn't copy",
  "Importar copia de seguridad": "Import backup",
  "Importar reemplaza los datos actuales y no se puede deshacer. Escribe {word} para confirmar.":
    "Importing replaces your current data and can't be undone. Type {word} to confirm.",
  Importar: "Import",
  "Escribir {word}": "Type {word}",
  "Se restaurarán los datos al estado anterior almacenado en el snapshot.":
    "Data will be restored to the previous state stored in the snapshot.",
  "Cuando converses con un Experto, aparecerá aquí.":
    "When you chat with an Expert, it will show up here.",
  "Se eliminarán todos los mensajes guardados. No afecta a tus Experts.":
    "All saved messages will be deleted. This doesn't affect your Experts.",
  "Se quitará el fichero de configuración y se aplicarán los valores por defecto.":
    "The configuration file will be removed and the defaults applied.",
  "Acceso a Google Drive": "Google Drive access",
  "Aprobar este acceso": "Approve this access",
  Denegar: "Deny",
  "Denegado. El asistente seguirá sin ese dato.":
    "Denied. The assistant will continue without that data.",
  "Aprobado. Consultando Google Drive…": "Approved. Querying Google Drive…",
  "Acceso a Google Drive denegado": "Google Drive access denied",
  "Listar tus archivos de Drive elegidos": "List your chosen Drive files",
  "Leer un archivo de Drive": "Read a Drive file",
  "Editar un archivo de Drive": "Edit a Drive file",
  "Buscar «{q}» en los archivos de Drive que elegiste":
    "Search for “{q}” in the Drive files you chose",
  "Crear «{name}» en Google Drive": "Create “{name}” in Google Drive",
};
