---
"@openexpert/openexpert": patch
---

`search_notion` y `query_notion_database` ya no entregan una lista corta como si fuera la lista
entera. La API de Notion devuelve como mucho 100 resultados por petición con un `has_more` y un
`next_cursor`, y el cliente pedía una sola página (`page_size: 25` en la búsqueda, 100 en la
consulta) sin mirar ninguno de los dos: en una base de 400 filas el asistente leía 100, las
trataba como todas y daba un total corto sin advertirlo; en un espacio con muchas páginas decía
que la que el usuario nombraba no existía. Ahora las dos lecturas recorren hasta cinco páginas
(500 resultados) por llamada, se detienen ahí a propósito y devuelven `count`, `hasMore` y
`nextCursor`; con un `cursor` se sigue exactamente donde se quedó la anterior, sin repetir la
consulta entera. Lo mismo valía para las páginas: `read_notion_page` cortaba a 300 bloques sin
nota, así que un acta de 400 llegaba a medias y el modelo la resumía como completa. La respuesta
trae ahora `blocks` y `hasMore`, y `maxBlocks` (hasta 1000) permite leer más en la siguiente
llamada. Las descripciones de las herramientas y las instrucciones del chat dicen cómo continuar,
y las pruebas nuevas fijan los dos casos con la red simulada: dos páginas encadenadas y tope
alcanzado con nota.
