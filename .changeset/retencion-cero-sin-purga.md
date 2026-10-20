---
"@openexpert/openexpert": patch
---

Con la retención de chat a `0` ya no se borra nada. La pantalla de Ajustes → Chat promete que `0`
desactiva la purga automática, pero `listConversations` calculaba el corte en el instante actual y
eliminaba todos los hilos del Experto —de la base y sin confirmación— en cuanto se abría el chat o
el listado. Ahora el cero se salta la poda y solo un valor mayor que cero recorta lo anterior al
corte; el valor por defecto (30 días) se comporta igual que antes.
