---
"@openexpert/openexpert": patch
---

La puerta de inyección ya no se come las respuestas del propio asistente. El catálogo nombra
palabras que una respuesta técnica normal usa (`bypass`, `system prompt`, `ignora ... instrucciones`),
y la puerta revisaba **toda** la conversación, incluidos los mensajes del asistente: una respuesta
del modelo que contuviera una de esas palabras **denegaba todos los turnos siguientes** de esa
conversación, sin que el usuario hubiera hecho nada malo. Y como la respuesta ya está guardada en
`chat_messages`, el bloqueo era permanente: recargar el historial devolvía la misma respuesta y el
siguiente turno volvía a denegarse. Al releer el historial, además, la respuesta desaparecía de lo
que ve el usuario y de lo que ve el modelo, pero seguía en la base.

Ahora lo que escribió el modelo no es un intento. **La base es lo que sabe qué respuestas escribió
el modelo**: se comparan con las respuestas guardadas, y solo se libran cuando el texto coincide
con el de una respuesta guardada. Un `assistant` falsificado por el cliente —que es lo que puede
mandar un cliente, porque el rol lo pone él— sigue contando como intento y se sigue bloqueando,
igual que el ataque en un turno anterior: la puerta no se relaja, deja de mirar lo que escribió
OpenExpert.
