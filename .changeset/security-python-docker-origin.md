---
"@openexpert/openexpert": patch
---

`run_python` deja de tener red: el script se ejecuta dentro de un espacio de nombres
aislado (`bubblewrap`; si no está, `unshare -n`) y, cuando el sistema no puede crear
ninguno, la herramienta se niega a ejecutar. Con `bubblewrap` tampoco ve el resto del
disco. La descripción de la herramienta y la documentación dicen ahora exactamente eso.

El despliegue Docker publica la app y Ollama solo en `127.0.0.1`, porque el panel no
tiene login, y queda escrito en el compose y en `docker/README.md`.

El control de origen de `/api/*` valida el `Host` y el `Origin` contra los hosts que el
servidor sirve, no contra el `Host` de la petición: cierra el DNS rebinding. Un `POST`
sin `Origin` ya no se da por bueno.
