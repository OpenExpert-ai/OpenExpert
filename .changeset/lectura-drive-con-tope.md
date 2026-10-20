---
"@openexpert/openexpert": patch
---

`read_drive_file` pide `size` en los metadatos y rechaza el archivo antes de descargarlo, y las
lecturas de texto y las exportaciones de Docs/Sheets/Slides dejan de bufferizar el documento
entero: el tope de 25 MB se aplica mientras se lee la respuesta y se cancela el resto. Antes, un
PDF de 800 MB o un `.txt` grande elegido con el Picker se descargaban completos para recién
después comparar el tamaño —en el caso del texto, ni siquiera había comparación—, así que el
proceso que sirve el panel y el chat se quedaba sin memoria en vez de responder con una nota.
