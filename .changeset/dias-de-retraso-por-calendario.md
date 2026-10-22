---
"@openexpert/openexpert": patch
---

Los días de retraso de una factura vencida ya no salen uno de más.

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
