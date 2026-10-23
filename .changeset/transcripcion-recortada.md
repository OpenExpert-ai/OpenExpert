---
"@openexpert/openexpert": patch
---

La transcripción de un PDF escaneado anuncia su recorte. La transcripción se cortaba en 200.000
caracteres sin decirlo, y lo que quedaba fuera no se podía volver a pedir: `extractText` devolvía
`{ text }` y descartaba la nota, así que `read_local_file` entregaba la transcripción en una sola
ventana, sin `hasMore`, y el modelo resumía la primera mitad como si fuera el documento entero. Ahora
la transcripción que se recorta trae `truncated`, los caracteres que se transcribieron y una nota
(«La transcripción del PDF se ha recortado a 200.000 caracteres de 300.000: el final del documento
no está en lo que se lee»), y la lectura la propaga; un documento que cabe entero sigue llegando sin
aviso.
