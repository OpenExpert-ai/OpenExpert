---
"@openexpert/openexpert": patch
---

La aprobación de una escritura se guarda con el mensaje. Al aprobar `create_local_file`,
`update_drive_file` o `create_notion_page`, la decisión no se escribía en ningún sitio: el
turno que continúa guardaba **solo** la respuesta nueva y dejaba intacta la fila del mensaje
que llevaba la tarjeta, así que al recargar el chat la tarjeta volvía con los botones vivos y
una segunda aprobación reenviaba la llamada al servidor, que ejecutaba la escritura otra vez
—una página de Notion duplicada, un archivo de Drive reescrito— mientras el usuario creía
haberlo hecho una sola vez.

Ahora el historial se identifica por el `message.id` que viaja dentro de cada fila y el turno
de continuación **actualiza** ese mensaje en vez de añadir otra copia: queda con la decisión
(`approval.approved`) y con el resultado de la herramienta, que es lo que se ve al recargar.
Además, la conversación guardada manda: si una pestaña vieja manda otra vez la aprobación de
una llamada que ya se resolvió, al modelo le llega el resultado que se guardó, no una
aprobación nueva, así que la herramienta no se ejecuta por segunda vez. Las conversaciones
que ya quedaron con las dos copias se leen con la decisión puesta.
