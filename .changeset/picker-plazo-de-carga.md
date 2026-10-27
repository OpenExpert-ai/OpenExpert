---
"@openexpert/openexpert": patch
---

El Picker de Drive deja de girar para siempre cuando la librería de Google no arranca.

`pickDriveFiles` resolvía la carga con `window.gapi.load("picker", () => resolve())` y no había
plazo: si `api.js` cargaba pero el módulo `picker` no arrancaba —un bloqueador que deja pasar la
primera petición y corta la siguiente, una CSP que permite `apis.google.com` pero no lo que ese
script pide después, una red que se corta entre las dos—, el callback no llegaba nunca y la promesa
quedaba pendiente para siempre. El botón «Seleccionar archivos» se quedaba girando sin mensaje y
sin poder reintentar sin recargar la página.

Ahora el arranque de la librería tiene un plazo de 20 s, el mismo tono que `fetchWithTimeout` en el
servidor: pasado ese tiempo la carga se rechaza con «El cargador de Google (gapi) no respondió en
20 s…», el `finally` del llamador baja el estado de carga y el aviso dice qué comprobar. El fallo no
se cachea: el siguiente clic vuelve a pedir la librería.
