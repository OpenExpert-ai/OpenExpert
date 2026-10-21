---
"@openexpert/openexpert": patch
---

Aprobar una reclamación de cobro ya no dice que se envió ningún correo. El registro de actividad
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
