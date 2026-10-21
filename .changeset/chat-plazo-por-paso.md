---
"@openexpert/openexpert": patch
---

El turno de chat tiene un plazo por paso. `streamText` no recibía ningún plazo y el `fetch` de
Node (undici) no trae uno propio, así que un proveedor que aceptaba la conexión y no contestaba
dejaba la respuesta «en vivo» hasta que el usuario pulsaba Stop, sin error y sin saber por qué.
Ahora cada paso se corta a los 4 minutos (ajustable con `OPENEXPERT_CHAT_TIMEOUT_MS`), que es más
que lo que puede durar el tool más lento —`run_python` corre hasta 120 s— y cubre también su
ejecución. El plazo por paso, y no solo el primer chunk: `firstChunkMs` no salta cuando el
proveedor no llega a mandar cabeceras, que es justo este caso.

El SDK reporta el vencimiento como un `abort`, y el navegador descarta los abortos en silencio: el
turno se paraba sin decir nada. Se reescribe como un `error` antes de salir, así que la interfaz
muestra «El proveedor de IA no respondió en 4 min y el turno se ha cortado». Un Stop del usuario
sigue siendo una cancelación y no un error.
