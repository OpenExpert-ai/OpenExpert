---
"@openexpert/openexpert": patch
---

Aprobar una escritura deja de leerse como una denegación. El bloque del chat que sustituye a la
tarjeta de aprobación trataba `approval-responded` como un «no», y ese es el estado de **cualquier**
respuesta: la decisión viaja en `approval.approved`. Así que en cuanto pulsabas «Aprobar este
acceso», la tarjeta desaparecía y en su lugar salía «Escritura local denegada» (o la de Drive o
Notion) hasta que la herramienta terminaba y llegaba su resultado: en una escritura de Drive, uno o
más segundos diciendo lo contrario de lo que acababas de decidir, y si la escritura fallaba después,
el usuario ya había leído que se había denegado. Ahora la respuesta aprobada repite el texto de la
tarjeta («Aprobado. Escribiendo el archivo…», «Aprobado. Consultando Google Drive…») y solo
`output-denied` o un `approved: false` dicen «denegado»; si el bloque no trae decisión, no dice nada
en vez de inventarla.
