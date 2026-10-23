// SPDX-License-Identifier: MIT
// Etiqueta que el panel de chat pinta para cada herramienta del catálogo
// (`createChatTools`). Vive fuera de la ruta para que una prueba pueda
// compararla con el catálogo real: las dos listas se mantenían a mano y las
// herramientas que se añadían se quedaban con el nombre técnico en crudo
// («run_python») en vez de con su descripción.
//
// El texto es la clave del diccionario: pasa por `t()`, así que una etiqueta
// nueva sin entrada en `src/locales/en.ts` sale en español con la interfaz en
// inglés, y las dos cosas las vigila `tool-labels.test.ts`.

export const TOOL_LABELS: Record<string, string> = {
  get_pipeline_summary: "Consultando pipeline comercial",
  list_deals: "Listando oportunidades del CRM",
  list_overdue_invoices: "Leyendo facturas vencidas",
  get_campaign_performance: "Extrayendo métricas de campañas",
  get_churn_risk: "Evaluando riesgo de churn",
  propose_invoice_reminders: "Preparando reclamaciones de cobro",
  propose_pause_campaigns: "Preparando pausa de campañas",
  open_expert_form: "Cargando plantilla de Experto",
  search_drive: "Buscando en Google Drive",
  read_drive_file: "Leyendo documento de Drive",
  create_drive_file: "Creando archivo en Google Drive",
  update_drive_file: "Actualizando archivo en Google Drive",
  list_local_files: "Listando archivos locales",
  search_local_files: "Buscando archivos locales",
  read_local_file: "Leyendo archivo local",
  create_local_file: "Creando archivo local",
  update_local_file: "Actualizando archivo local",
  search_inside_files: "Buscando dentro de los archivos",
  run_python: "Ejecutando Python",
  search_notion: "Buscando en Notion",
  query_notion_database: "Consultando base de Notion",
  describe_notion_data_source: "Consultando esquema de Notion",
  read_notion_page: "Leyendo página de Notion",
  create_notion_page: "Creando página en Notion",
  update_notion_page: "Actualizando página en Notion",
  append_notion_blocks: "Añadiendo contenido en Notion",
};
