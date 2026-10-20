---
"@openexpert/openexpert": patch
---

`read_local_file` ya puede devolver el resto de una línea más larga que el tope de una lectura. La
ventana se cortaba por líneas y después por caracteres, y los dos cortes no se hablaban: en un
archivo de una sola línea de 300.000 caracteres —el JSON de una exportación, un `.js` o un `.css`
minificado, un `.svg`, un CSV con retornos de carro antiguos— la lectura devolvía 200.000
caracteres con `truncated: true`, `totalLines: 1` y ni `hasMore` ni `nextOffset`, así que los
100.000 que faltaban no se podían pedir con ninguna llamada posterior. Ahora la respuesta trae
también `nextCharOffset`, el carácter de esa línea donde empieza el siguiente trozo, y la lectura
continúa desde ahí con `charOffset`: lo leído en dos llamadas reconstruye el archivo entero, sin
huecos ni repetidos. El corte por caracteres dentro de un archivo de varias líneas se arregla con
el mismo cursor, que antes saltaba a la línea siguiente y dejaba el resto de la larga sin leer. Y un
`offset` mayor que el número de líneas devuelve ahora una nota con el total y el rango válido, en
vez de un contenido vacío que se leía como un archivo vacío.
