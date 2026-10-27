---
"@openexpert/openexpert": patch
---

El tope de filas de la importación de CSV se anuncia con su recuento. Un fichero de 5.237 filas
importaba 5.000 y avisaba de «una fila con error» —el corte entraba en `errors`—, así que el
usuario leía que le faltaba una fila cuando le faltaba un bloque de 237. `parseBusinessCsv`
publica ahora `omitted` con las filas que el tope dejó sin leer (0 si caben todas), no las cuenta
como errores, y el panel las anuncia en su propio aviso, en castellano y en inglés. El tope sigue
siendo 5.000 filas y vive en `CSV_MAX_ROWS`.
