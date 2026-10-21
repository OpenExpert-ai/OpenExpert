---
"@openexpert/openexpert": patch
---

Las hojas de Excel informan de las filas de datos, no de la cabecera. `xlsxText` publicaba
`rows: sheetLines.length - 1`, que descuenta la línea con el nombre de la hoja y no la cabecera, así
que la cabecera quedaba contada como fila de datos: un `.xlsx` con cabecera y tres filas
(Ana, Luis, Marta) se anunciaba como cuatro. El modelo recibe ese número por `read_local_file` y lo
repite al usuario, de modo que una tabla de tres filas se contaba como de cuatro con toda la
confianza y sin ningún error a la vista. El comentario del código ya decía lo correcto y la ruta CSV
(`csvStructure`) sí descontaba la cabecera, así que el mismo campo `rows` significaba dos cosas
según el formato. Ahora `rows` cuenta filas de datos en los dos, la cabecera vive solo en
`columns`, una hoja con solo cabecera da `0` y una hoja vacía no da negativo. La descripción de
`read_local_file` lo dice también, para que el modelo no tenga que adivinarlo.
