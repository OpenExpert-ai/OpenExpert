# 006 · Una clave por proveedor

- **Estado:** aceptado.
- **Fecha:** 2026-10.

## Contexto

El catálogo da una ficha a cada proveedor. La primera versión dejó que dos de
ellos (`openai-compatible` y `opencode-go`) nombraran **la misma variable** para su
clave, y no falló nada hasta configurar los dos: la segunda clave pisó la primera,
y el proveedor que se quedó sin ella respondía 401 como si nunca se hubiera
configurado. La ficha de Anthropic declaraba su propia variable, pero el panel no
tenía campo para ella —su lista de proveedores estaba escrita a mano—, así que su
clave no había dónde guardarla.

## Decisión

**La clave de un proveedor es de ese proveedor.** Cada ficha declara la variable
que la guarda y dos fichas no pueden compartirla; un test lo impone. El catálogo
es el único sitio que sabe de dónde salen una clave, una dirección y una lista de
modelos, y todo lo que necesita la respuesta —el panel, el CLI, `doctor`, listar
modelos— la lee de la ficha en vez de quedarse con una lista propia. Cuando falta
una clave se dice **cuál** falta, nunca se prueba con la de otro.

## Consecuencias

- Añadir un proveedor es añadir un registro: su campo de clave, su dirección y sus
  modelos aparecen sin tocar la interfaz ni los validadores.
- Cambiar de proveedor no borra claves, así que ir y volver no cuesta nada.
- A un proveedor que no guarda clave (un modelo local) no se le puede dar una: la
  petición se rechaza en vez de descartarse en silencio.
- Cada dirección se escribe donde dice su ficha: la del servidor local es
  configuración (`openexpert.json`) y cualquier otra que ponga el usuario es un
  secreto.
