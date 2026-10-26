---
"@openexpert/openexpert": patch
---

La retención del historial se aplica a toda la instalación. `chat.retentionDays` es un solo número
para la instalación y el panel lo anuncia como la retención del historial, pero `listConversations`
filtraba por Experto y podaba solo las conversaciones caducadas del Experto cuya lista se abría: el
historial de cualquiera que no se visitara se quedaba en `chat_messages` para siempre, y no hay otro
sitio que pode. Ahora, al abrir la lista de cualquier Experto se revisa la tabla entera y se borran
todos los hilos fuera del plazo, sean del Experto que se abre o no; la lista devuelta sigue siendo la
del Experto pedido, en el mismo orden. `0` sigue desactivando la purga.
