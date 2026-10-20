---
"@openexpert/openexpert": patch
---

Las diapositivas de un `.pptx` se leen en el orden del mazo, no en el de los nombres de fichero.
`pptxText` ordenaba las entradas del ZIP con un `.sort()` de cadenas, así que `slide10.xml` caía
entre `slide1.xml` y `slide2.xml`: en un mazo de diez o más diapositivas el modelo recibía la 2, la
3… después de la 12 y contestaba «qué dice la diapositiva 3» o «qué va justo después del índice»
con el fragmento equivocado, sin ningún error a la vista. Ahora el orden sale del número de la
diapositiva comparado como entero, que es lo que `read_drive_file` y `read_local_file` entregan al
modelo como si fuera el documento en orden.
