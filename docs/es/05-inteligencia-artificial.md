# 05 · Inteligencia artificial

> **Audiencia:** ambos. Herramientas, aislamiento y límites.

---

## 1. Modelo y proveedor

El modelo es configuración (ver [Proveedores de IA](./13-proveedores-ia.md)):
`ollama` (defecto, local), `google` (clave gratuita de Gemini) o
`openai-compatible` (BYOK). El asistente responde siempre en español, muestra su
razonamiento y transmite token a token (hasta 50 pasos por turno).

## 2. Catálogo de herramientas

El asistente no accede directamente a la base de datos; solo puede invocar estas
herramientas.

### Lectura

| Herramienta                | Contenido                                                   | Dominio              |
| -------------------------- | ----------------------------------------------------------- | -------------------- |
| `get_pipeline_summary`     | Valor abierto, nº de deals, win rate, previsión, estancados | `ventas`             |
| `list_deals`               | Oportunidades abiertas, opcionalmente por etapa             | `ventas`             |
| `list_overdue_invoices`    | Facturas vencidas con importe, días y recordatorios         | `finanzas`           |
| `get_campaign_performance` | Gasto, conversiones, CPA real vs objetivo, estado           | `marketing`          |
| `get_churn_risk`           | MRR, tendencia de uso, tickets, probabilidad de baja        | `general`            |
| `list_processes`           | Catálogo de procesos (solo los dominios del Experto)        | Dominios del Experto |

Los datos de negocio **no se incluyen**: las tablas arrancan vacías. Una
herramienta solo atribuye el dato a un proveedor cuando esa integración está
conectada (`connected: true`); si no, devuelve un `note` indicando que no hay
fuente conectada, de modo que el asistente nunca presenta datos locales como
reales.

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
| `read_local_file`                         | `local` en `sources`                     |
| `create_local_file` / `update_local_file` | `local` en `sources` + aprobación humana |

Las herramientas de lectura extraen texto de ficheros de texto, PDF, Word
(`.docx`), Excel (`.xlsx`) y PowerPoint (`.pptx`), tanto en carpetas locales como
en Google Drive.

### Propuestas (no ejecutan)

| Herramienta                 | Propone                                 |
| --------------------------- | --------------------------------------- |
| `propose_invoice_reminders` | Enviar reclamaciones de cobro           |
| `propose_pause_campaigns`   | Pausar campañas por encima del objetivo |
| `request_process_run`       | Ejecutar un proceso autónomo            |

Crean una fila en `activity` con estado `pending`, mostrada como tarjeta de
confirmación. Nada cambia hasta que la apruebas.

### Utilidad

| Herramienta        | Función                          |
| ------------------ | -------------------------------- |
| `open_expert_form` | Formulario para crear un Experto |

## 3. Aislamiento por dominio

Cada herramienta de lectura pertenece a un dominio. Cada Experto guarda los
dominios que puede leer en `experts.domains`; el servidor comprueba el dominio
contra esa lista antes de devolver datos; si no, devuelve un error explícito
"fuera de contexto", sin datos. `list_processes` y `request_process_run`
respetan la misma lista, así que un proceso solo es visible y ejecutable desde un
Experto dueño de su dominio. El acceso a Drive se decide por la columna
`sources` del Experto; el acceso a archivos locales se decide por el origen
`local` y queda además restringido a las carpetas autorizadas. Los dominios se
eligen al crear o editar un Experto; un Experto sin dominios puede chatear y usar
Drive, pero no lee datos de negocio.

## 4. Límites

| Límite                 | Valor                              |
| ---------------------- | ---------------------------------- |
| Pasos por turno        | 50                                 |
| Retención de historial | 30 días                            |
| Coste                  | El del proveedor; Ollama es gratis |

## 5. Referencias

- [Seguridad y acceso](./04-seguridad-y-acceso.md) — garantías.
- [Proveedores de IA](./13-proveedores-ia.md) — Ollama, Gemini, BYOK.
