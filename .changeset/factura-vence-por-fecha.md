---
"@openexpert/openexpert": patch
---

Una factura vence por su fecha y no por una etiqueta que nadie escribe. `overdueInvoices`
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
