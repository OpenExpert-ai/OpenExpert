---
"@openexpert/openexpert": patch
---

La copia de seguridad ya restaura las integraciones. El sobre llevaba `credentials.json` sin
`secret.key`, así que al importarlo en otro equipo los tokens volvían cifrados con una clave que no
estaba y la aplicación los contaba como «Drive no conectado», el Picker aparecía vacío, las
herramientas de archivos locales decían que no había ninguna carpeta autorizada y Notion salía
desconectado, todo sin un aviso. Ahora el sobre lleva también la clave, las concesiones del Picker,
las carpetas locales, el token de Notion y el consentimiento de Drive, y la tarjeta avisa de que el
fichero abre los tokens. Una copia del formato anterior (versión 1) se sigue aceptando, pero al
importarla se dice qué no traía en vez de dar la restauración por completa.
