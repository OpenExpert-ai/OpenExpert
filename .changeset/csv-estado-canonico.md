---
"@openexpert/openexpert": patch
---

El estado de una fila importada se guarda con el vocabulario que leen el panel y el asistente. El
importador de CSV guardaba la celda tal cual y todos los lectores comparan contra `open`/`won`/`lost`
en ventas, `paid`/`cancelled` en facturas y `active` en campañas, así que un fichero exportado de un
CRM en castellano entraba sin un solo aviso y después no lo veía nadie: el pipeline contestaba 0 €
abiertos y 0 % de win rate sobre una tabla llena, una factura «Pagada» aparecía vencida y el asistente
proponía reclamar el cobro a un cliente que ya había pagado, y una campaña «ACTIVA» no se podía
pausar. `parseBusinessCsv` traduce ahora la celda a su valor canónico —castellano, mayúsculas,
tildes, «Closed Won», «enabled»— y **rechaza la fila** cuyo estado no conoce nombrando el valor y los
aceptados, como ya hacía con un importe que no es un número. El vocabulario vive en
`src/lib/business-status.ts` y lo comparten el importador, los conectores y los lectores.
