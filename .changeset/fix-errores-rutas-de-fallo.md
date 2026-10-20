---
"@openexpert/openexpert": patch
---

Cierra las rutas de fallo que dejaban la instalación muerta, colgada o sin rastro: la base de datos
se reintenta tras un arranque fallido (antes quedaba envenenada hasta reiniciar), una copia de
seguridad se valida antes de sustituir nada y deja la anterior en `openexpert.db.bak` con vuelta
atrás, una `secret.key` dañada falla en voz alta en vez de regenerarse encima de los tokens, los
patrones de inyección con cuantificadores anidados se rechazan (congelaban el servidor 59 s con 29
caracteres), las llamadas a Drive y Notion llevan timeout, los fallos del registro de auditoría se
registran con contexto y `run_python` ya no bloquea el bucle de eventos.
