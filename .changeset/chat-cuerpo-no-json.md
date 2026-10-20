---
"@openexpert/openexpert": patch
---

`POST /api/chat` responde 400 cuando el cuerpo no es JSON. `request.json()` se llamaba sin
protección: un cuerpo cortado por la red o escrito a mano lanzaba `SyntaxError`, subía hasta el
catch del servidor y devolvía un 500 con la página de error SSR, con una entrada `ssr.unhandled`
en el registro por un fallo que era del cliente. Ahora un cuerpo que no es JSON (vacío incluido)
devuelve 400 con `{"error": "JSON inválido"}` en JSON; el cuerpo válido con forma inválida sigue
dando 400 «Petición inválida».
