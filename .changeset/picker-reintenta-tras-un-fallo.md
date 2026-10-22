---
"@openexpert/openexpert": patch
---

El Google Picker se puede volver a intentar. Si el script `api.js` de Google no cargaba —la
conexión se cayó, un bloqueador de scripts lo paró, la CSP no lo permitía—, todos los clics
siguientes en «Seleccionar archivos» fallaban al instante con el mismo error, sin volver a pedir
el script: el usuario arreglaba la causa, volvía a pulsar y seguía fallando hasta recargar la
página entera. Y el mensaje que veía le decía que comprobara la conexión, que era justo lo que
acababa de hacer.

La promesa rechazada ya no se queda cacheada para siempre, y el `<script>` muerto sale de la
página cuando falla, para que el reintento monte uno nuevo en vez de esperar a uno que no va a
cargar nunca. Es el mismo patrón que ya usa la base de datos (`src/lib/db.server.ts`): una
rechazo cacheado sobrevive a la causa que lo produjo, y lo único que arregla es recargar la
página.
