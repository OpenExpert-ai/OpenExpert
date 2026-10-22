---
"@openexpert/openexpert": patch
---

La restauración de una copia valida la configuración que trae. `openexpert.json` tiene un esquema en
el repositorio —el mismo por el que pasan el panel de ajustes y el editor en crudo, que cortan
`chat.maxSteps` a 200 pasos, `chat.retentionDays` a 3650 días y `ai.maxOutputTokens` a 200000
tokens— y la restauración escribía el fichero tal cual venía en el sobre. Una copia podía dejar la
instalación con 100000 pasos por consulta (100000 llamadas facturables al proveedor en una sola
petición), con la purga del historial desactivada de golpe y con un patrón de inyección que congela
el servidor, y la aplicación lo cargaba todo como si el panel lo hubiera aceptado.

La comprobación está en la puerta, no en quien genera el sobre: una copia puede venir de otro
equipo, de una versión antigua o de ninguna parte. Ahora la configuración se valida **antes** de
preparar nada, y una copia que la aplicación no puede usar se rechaza entera: no se cambia nada y
el `openexpert.json` de la instalación sigue siendo el que tenía. El mensaje dice qué campo rompe
qué límite («chat.maxSteps: va de 1 a 200 pasos por consulta»), en español y no con el «Invalid
option» de Zod.

De paso, la lista de patrones de inyección lleva el mismo tope que el panel (cincuenta). Medir un
patrón es caro —se mide contra una entrada adversaria—, así que una lista con doscientos tardaba
segundos solo en validarla; ahora se cuentan antes de medir ninguno. Y el mensaje de un proveedor
que el catálogo no conoce dice en español cuáles existen.
