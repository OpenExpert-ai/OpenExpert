---
"@openexpert/openexpert": patch
---

La interfaz en inglés deja de tener frases en español. Faltaban 15 cadenas en
`src/locales/en.ts` —17 llamadas— y el respaldo de `translate` las mostraba tal
cual, sin avisar: la página 404 y la de error entera, el botón «Reintentar» de la
barra de error, el texto para lectores de pantalla del selector de Experto,
«Pensando…» del chat, «Clave de API», la opción de leer PDF escaneados con su
explicación, «Fuentes pendientes» y «Entidades» en Fuentes, la descripción de
Integraciones y la pregunta de borrar `openexpert.json`. Ahora están traducidas y
`src/locales/en.test.ts` compara cada `t("…")` literal de `src/` con el
diccionario, así que un hueco nuevo tumba la suite en vez de aparecer en pantalla.
