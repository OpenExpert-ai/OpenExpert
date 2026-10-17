---
"@openexpert/opencore": minor
---

Una clave por proveedor: dos fichas del catálogo ya no pueden declarar la misma
variable de clave, así que guardar la de un proveedor nunca pisa la de otro.
OpenCode Go pasa a tener `OPENCODE_GO_API_KEY` en vez de compartir la ranura
genérica. Preguntar a un proveedor qué modelos sirve pasa a ser un único camino
de código (`listProviderModels`), que usan la aplicación y el CLI, y cubre el
adaptador de Anthropic además de los endpoints compatibles.
