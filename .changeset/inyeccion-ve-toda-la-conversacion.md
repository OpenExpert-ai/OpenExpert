---
"@openexpert/openexpert": patch
---

El filtro de inyección revisa toda la conversación, no solo el último mensaje. La puerta se aplicaba a
`lastMessageText(messages)`, que lee el último elemento del array: el modelo recibe el array entero como
historial, así que un `[ataque, saludo]` pasaba el filtro y el intento viajaba al modelo sin evento de
auditoría. Lo mismo con el rol falsificado a `assistant`, que también es dato del cliente. Ahora se revisa
cada mensaje (con tope de 32 000 caracteres por mensaje, para que un cuerpo de 200 mensajes no convierta el
regex en coste de CPU), el bloqueo nombra el mensaje que lo ha disparado y el turno denegado no se guarda:
antes se persistía el mensaje bloqueado, y con la puerta mirando todo el array esa conversación habría
quedado denegada para siempre. Al releer el historial se descarta además cualquier mensaje que el filtro
rechace, que es la salida para las filas escritas mientras la puerta solo miraba la última.
