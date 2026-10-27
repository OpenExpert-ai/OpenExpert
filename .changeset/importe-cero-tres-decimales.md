---
"@openexpert/openexpert": patch
---

Un importe con la parte entera a cero deja de multiplicarse por mil al importar.

`parseNumber` (`src/lib/business-csv.ts`) decidía que un punto era separador de miles cuando había
exactamente tres decimales (`dots > 1 || decimals === 3`), sin mirar la parte entera. Con la parte
entera a cero eso no puede ser un grupo de miles —nadie escribe `0.500` para decir quinientos—, así
que un CSV en formato inglés con tres decimales entraba multiplicado por mil: una factura de 0,50 €
se importaba como 500 € y la herramienta de facturas vencidas la sumaba tal cual, sin aviso en la
importación (el valor «era un número», solo que no el que decía el fichero). El mismo valor escrito
con coma (`0,500`) sí entraba bien, porque la rama de la coma siempre es decimal.

Ahora, con un solo punto y la parte entera a cero (o `-0`), el punto es la marca decimal:
`parseMoney("0.500")` devuelve 0,5 y `parseMoney("-0.125")` devuelve -0,125. Los formatos que ya se
leían bien no cambian: `1.234` sigue siendo 1234, `12.345` 12345, `1.234,56` 1234,56 y `1234.56`
1234,56. La regla queda escrita en el comentario de `parseNumber` y en la documentación de la
importación CSV, en español y en inglés.
