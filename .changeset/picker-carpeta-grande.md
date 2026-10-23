---
"@openexpert/openexpert": patch
---

El selector de carpetas deja de cortar sin decirlo, y ya no se come las subcarpetas. `browseDirectory`
paraba a las 2 000 entradas **antes** de ordenar: en una carpeta real de trabajo (Descargas, una
sincronizada) el orden del `readdir` —que no pone las carpetas primero— podía llenar la lista con
2 000 ficheros y dejar fuera las 20 subcarpetas, que son lo único que se puede pulsar para seguir
navegando. El usuario no podía llegar a lo que no salía y el diálogo no daba ninguna pista de que la
carpeta tuviera más; además dos peticiones iguales podían devolver conjuntos distintos.

Ahora se ordena primero (carpetas delante, luego por nombre) y el corte se hace al final, así que la
lista es estable y las subcarpetas entran siempre. La respuesta dice lo que falta con `total` (las
entradas que hay de verdad) y `truncated`, y el diálogo de **Integraciones → Fuentes → Archivos
locales** lo escribe cuando la carpeta no cabe: «Se muestran 2.000 de 2.120 entradas», en castellano
y en inglés.
