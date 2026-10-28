---
"@openexpert/openexpert": patch
---

El workspace deja de llevar las facturas y las campañas enteras. `getWorkspace` devolvía
`invoices` y `campaigns` completas desde las tablas, y la ventana se refresca cada 15 s mientras la
app está abierta: con la base en el tope del importador (5.000 facturas y 5.000 campañas) eso eran
872 KB por lectura, de los que 870 KB eran las dos listas. Ningún componente las lee —las facturas
y las campañas aparecen en la pantalla como recuento y en el chat como salida de sus herramientas,
que ya paginan y dicen cuántas filas dejan fuera— así que viajaban para nada en cada refresco. El
workspace se queda con lo que la ventana pinta (propietario, Expertos, integraciones, la ventana del
registro de actividad y su total) y con `businessRows`, el recuento de filas de negocio: un CRM
importado sigue contando como «hay datos» y el chat no vuelve a decir que no hay nada que consultar.
