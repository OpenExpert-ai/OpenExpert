---
"@openexpert/openexpert": patch
---

Los contadores de una integración se leen en el idioma de la interfaz. El panel de datos pintaba el
nombre que guardó la sincronización tal cual (`settings.data.tsx`), y cada sincronizador lo escribe
en su idioma: «Documentos», «Hojas de cálculo», «Presentaciones», «Carpetas» y «Otros archivos» desde
Drive y las carpetas locales, «Facturas» desde Holded y «Deals» desde Pipedrive. Con la interfaz en
inglés una conexión de Drive anunciaba «Documentos: 12 · Carpetas: 3», y en castellano la de
Pipedrive anunciaba «Deals: 120» en una app que llama «Ventas» a esa tabla. Ahora `syncedEntityLabel`
traduce las etiquetas conocidas —«Deals» pasa por «Ventas»— y deja tal cual lo que no lo es, porque el
nombre de un espacio de Notion es dato del usuario.
