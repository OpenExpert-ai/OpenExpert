---
"@openexpert/openexpert": patch
---

La restauración de una copia es todo o nada. El comentario de la función lo prometía desde hacía
versiones, pero los ficheros se renombraban de uno en uno y el `catch` solo devolvía la base de
datos: si el último fallaba —un `credentials.json` que no se puede reemplazar, por ejemplo—, la
instalación se quedaba con la base de ayer y el `openexpert.json` y el `secrets.json` de la copia, y
el aviso hablaba únicamente de la base, así que nada hacía sospechar del resto.

Ahora el contenido de cada fichero que se va a sustituir se guarda antes (`<fichero>.pre-restore`, y
`openexpert.db.bak` para la base, que es el que el panel anuncia), la base se aplica la última —solo
cuando todo lo demás ya está en su sitio— y, si un rename falla, lo ya aplicado vuelve a su contenido
anterior en orden inverso. El error dice qué se ha deshecho y qué no, nombrando el fichero que falla,
en vez de dar a entender que todo se ha restaurado.
