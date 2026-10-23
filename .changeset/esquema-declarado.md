---
"@openexpert/openexpert": patch
---

El esquema publicado acepta el fichero que escribe la propia aplicación. `openexpert.json` lleva
`$schema` —la clave con la que el editor valida el fichero— y el panel de chat escribe
`chat.visionPdf`, pero `openexpert.schema.json` declara `additionalProperties: false` sin nombrar
ninguna de las dos, así que **todo** fichero con `$schema`, es decir todos los que escribe la
aplicación, era inválido para el esquema que él mismo declaraba: el `openexpert.json.example` que
publica el repo fallaba su propia validación y un editor o cualquier herramienta de la cadena decía
que la configuración no valía. Ahora las dos claves están declaradas, y una puerta
(`src/lib/config.schema.test.ts`) compara el esquema con lo que `fileConfigSchema` y
`chatUpdateSchema` pueden escribir en cada nivel, para que el siguiente `chat.*` que se añada no se
quede fuera otra vez.
