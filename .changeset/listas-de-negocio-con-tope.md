---
"@openexpert/openexpert": patch
---

Las dos listas de negocio del chat dicen cuántas filas hay en vez de mandar la tabla entera:
`list_deals` y `list_overdue_invoices` devuelven como mucho 200 filas, con `total` (las que
coinciden, la cifra que el modelo cita), `hasMore` y una nota que dice cuántas se enseñan de cuántas.
El importador de CSV y los conectores llenan estas tablas con hasta 5 000 filas, así que la lista
entera gastaba el turno en tokens, el modelo perdía el hilo de la pregunta y, si el proveedor cortaba
por longitud, el usuario leía un error en lugar de la lista.
