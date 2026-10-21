---
"@openexpert/openexpert": patch
---

El texto de un `.odt` llega en el orden del documento, no con todos los títulos al final. `odfText`
recorría `content.xml` dos veces y concatenaba —primero todos los `text:p` y después todos los
`text:h`—, así que un documento con «Capítulo 1 / párrafo / Capítulo 2 / párrafo» se leía como
«párrafo / párrafo / Capítulo 1 / Capítulo 2»: el modelo resumía el cuerpo sin saber a qué apartado
pertenecía cada párrafo y contestaba con la sección equivocada, sin ningún error a la vista. Ahora
un solo recorrido se queda con `text:p` y `text:h` en el orden en que aparecen, que es el mismo que
necesitan las celdas de un `.ods` y los cuadros de texto de un `.odp`.
