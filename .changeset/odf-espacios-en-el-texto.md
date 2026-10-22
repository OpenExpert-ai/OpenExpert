---
"@openexpert/openexpert": patch
---

El texto de un `.odt`, un `.ods` o un `.odp` conserva los espacios, los tabuladores y los saltos de
línea, así que las palabras ya no salen pegadas.

Un OpenDocument no escribe el espacio en blanco como carácter: dos espacios seguidos, una sangría
hecha con espacios o un tabulador se escriben como elementos vacíos —`<text:s text:c="3"/>`,
`<text:tab/>` y `<text:line-break/>`, que es lo que hace cualquier procesador de textos para que el
espacio no sea ambiguo—, y son los únicos elementos cuyo contenido es la propia etiqueta. El lector
descartaba todo lo que caía entre `<` y `>`, así que `Hola<text:s text:c="3"/>mundo` llegaba como
«Holamundo», `Columna A<text:tab/>Columna B` como «Columna AColumna B» y
`Primera<text:line-break/>Segunda` como «PrimeraSegunda», sin ningún error ni nota. El modelo
recibía palabras que el documento no tiene y las citaba y resumía con toda la confianza.

Ahora `text:s` produce tantos espacios como diga su atributo `text:c` (uno cuando falta), `text:tab`
un tabulador y `text:line-break` un salto de línea. El recuento de `text:s` está acotado a 1000
espacios por elemento: es un número que pone el documento y nada lo limita, y un elemento de treinta
bytes pidiendo mil millones convertiría el tope de 64 MB del archivo en una cadena que no cabe en
memoria. La prueba monta los tres casos y los compara carácter a carácter, y el texto de los
documentos que ya se leían bien no cambia.
