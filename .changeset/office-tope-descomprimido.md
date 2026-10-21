---
"@openexpert/openexpert": patch
---

Leer un `.pptx` o un OpenDocument ya no puede agotar la memoria del proceso. El lector llamaba a
`unzipSync` sin filtro, así que descomprimía el archivador entero —imágenes y medios del mazo
incluidos— y lo devolvía en memoria antes de mirar qué se usaba: el tamaño en disco no dice nada del
que va a ocupar, porque deflate sobre datos repetidos amplifica 1000x. Medido: un `.odt` de 262.080
bytes con 256 MB de ceros dentro de `content.xml` tardaba 2.072 ms y subía el RSS 549 MB; en un equipo
de 8 GB eso se lleva por delante el proceso que está sirviendo el chat. Ahora hay un tope explícito de
64 MB descomprimidos que se comprueba contra el `originalSize` del directorio central **antes** de
inflar, y solo se descomprimen las entradas que se leen (`ppt/slides/*.xml` y `content.xml`). El mismo
fichero tarda 15 ms, sube 32 MB y responde `text: null` con una nota que lo explica, en vez de
«El documento no contiene texto extraíble», que hacía pasar una bomba por un documento vacío. Los
`.docx` y `.xlsx` quedan fuera de esta puerta: mammoth y exceljs descomprimen el archivo entero por
dentro y no aceptan un filtro.
