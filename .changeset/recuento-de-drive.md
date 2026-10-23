---
"@openexpert/openexpert": patch
---

`search_drive` dice cuántas coincidencias deja fuera. La herramienta filtraba los archivos concedidos
con el Picker y hacía `.slice(0, 100)` sin recuento, así que el modelo recibía 100 entradas, las daba
por la lista completa y contestaba que el archivo 101 no existía. Ahora la respuesta lleva `total`
con todas las coincidencias y, cuando la página es más corta que ellas, `hasMore: true` y una nota
(«Se listan 100 de 150 coincidencias. Acota la búsqueda con un nombre más preciso»), igual que
`list_local_files` y `search_local_files`; la descripción de la herramienta y el prompt del sistema
lo dicen para que el modelo acote en vez de dar el corte por el total.
