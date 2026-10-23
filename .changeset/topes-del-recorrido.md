---
"@openexpert/openexpert": patch
---

Las herramientas de archivos locales dicen cuándo se han cortado, en vez de presentar el tope como el
total. El recorrido de una carpeta concedida se para en 5 000 archivos y 8 niveles, y ese tope
viajaba al modelo como si fuera el dato: `list_local_files` contestaba `total: 5000` sobre una
carpeta de 20 000 archivos y `search_local_files` devolvía 200 coincidencias sin decir cuántas había,
así que la respuesta era «no hay ningún archivo que mencione eso» con el archivo dentro de la
carpeta. Ahora el recorrido devuelve `{ files, truncated }` y los topes se anuncian: `truncated:
true` cuando el recorrido se cortó (por número de archivos o por profundidad), `total` solo cuando
es un recuento de verdad, y en `search_inside_files` la nota distingue las dos razones de pararse —
«hay más coincidencias» cuando se llenó el cupo de resultados y «quedan N archivos sin revisar»
cuando lo que se acabó fue el cupo de archivos, que antes decía lo primero en los dos casos.
