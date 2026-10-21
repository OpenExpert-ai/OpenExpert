---
"@openexpert/openexpert": patch
---

`read_drive_file` ya puede devolver un documento entero, no solo su primer tercio. La lectura
cortaba el texto en el carácter 20.000 y avisaba con `truncated: true`, pero la herramienta solo
aceptaba `fileId`: no había offset ni cursor, así que todo lo que venía después del corte era
inalcanzable y el Experto respondía con lo que tenía sin poder pedir el resto. Ahora el texto sale
por ventanas de líneas —2000 líneas y 20.000 caracteres por lectura— con el mismo cursor que
`read_local_file`: `hasMore` y `nextOffset` para seguir, y `nextCharOffset` (que se manda en
`charOffset`) cuando el corte cae dentro de una línea, que es el caso de un CSV de Sheets o de un
JSON de una sola línea. `totalChars` dice cuánto mide el documento, y un `offset` más allá del final
devuelve una nota con el total en vez de un contenido vacío que se lee como un archivo vacío. Un
documento de 35.000 caracteres se lee entero en dos llamadas, sin repetir ni saltarse texto. La
ventana es una sola función, `takeWindow` en `text-window.ts`, compartida por los dos lectores.
