---
"@openexpert/openexpert": patch
---

`POST /api/chat` contesta 400 cuando el mensaje trae un rol que el SDK no acepta. El esquema de la
petición admitía cuatro roles —`user`, `assistant`, `system` y `data`— y los dos últimos no son
roles que `convertToModelMessages` sepa convertir: con `system` el SDK lanza
`AI_InvalidPromptError` (`allowSystemInMessages` está apagado) y `data` no tiene caso, así que la
petición pasaba la validación y reventaba tres líneas más abajo, sin capturar, y el cliente recibía
la página de error 500 con la traza del SDK en vez del 400 «Petición inválida» que el mismo endpoint
devuelve para cualquier otro cuerpo mal formado. El esquema acepta ahora los dos roles que la
interfaz manda de verdad (`user` y `assistant`), que son los mismos que la dependencia toma de un
mensaje de cliente.
